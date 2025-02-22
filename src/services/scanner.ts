import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { DbClient } from './dbClient';
import { TransactionParser } from './parser';
import { Transaction, JungleBusTransaction, ParsedTransaction, ScannerEvents } from '../shared/types.js';
import { logger } from '../utils/logger';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import { CONFIG } from './config';
import { randomUUID } from 'crypto';

export class Scanner extends EventEmitter {
    private jungleBus: JungleBusClient | null = null;
    private dbClient: DbClient;
    private parser: TransactionParser;
    private isConnected: boolean = false;
    private retryCount: number = 0;
    private subscriptions: Map<string, any> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second
    private readonly START_BLOCK = 883850;
    private readonly API_BASE_URL = 'https://junglebus.gorillapool.io/v1';
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;

    constructor(parser: TransactionParser, dbClient: DbClient) {
        super();
        this.dbClient = dbClient;
        this.parser = parser;

        // Set up error handling for uncaught events
        this.on('error', (error) => {
            logger.error('Unhandled scanner error', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        });

        logger.info('Scanner initialized', {
            startBlock: this.START_BLOCK,
            maxRetries: this.MAX_RETRIES,
            retryDelay: this.RETRY_DELAY,
            subscriptionId: this.SUBSCRIPTION_ID
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        const startTime = Date.now();
        const txid = tx.transaction?.hash || tx.hash;

        logger.debug('Starting transaction processing', {
            txid,
            blockHeight: tx.block?.height || tx.height,
            timestamp: tx.block?.timestamp,
            processingStartTime: new Date(startTime).toISOString()
        });

        try {
            // Hand over to parser with just the txid
            const parsedTx = await this.parser.parseTransaction(txid);
            
            if (!parsedTx) {
                logger.debug('Transaction skipped - no relevant data found', {
                    txid,
                    processingTime: Date.now() - startTime
                });
                return;
            }

            logger.info('Transaction successfully parsed', {
                txid: parsedTx.txid,
                protocols: parsedTx.protocols,
                contentTypes: parsedTx.contentTypes,
                dataSize: JSON.stringify(parsedTx).length,
                processingTime: Date.now() - startTime
            });

            // Save to database
            logger.debug('Attempting to save transaction to database', {
                txid: parsedTx.txid
            });

            await this.dbClient.saveTransaction(parsedTx);
            
            const totalTime = Date.now() - startTime;
            logger.info('Transaction fully processed and saved', {
                txid: parsedTx.txid,
                protocols: parsedTx.protocols,
                totalProcessingTime: totalTime,
                timestamp: new Date().toISOString()
            });

            // Emit success event for monitoring
            this.emit('transaction:processed', {
                txid: parsedTx.txid,
                processingTime: totalTime,
                protocols: parsedTx.protocols
            });

        } catch (error) {
            const errorTime = Date.now() - startTime;
            logger.error('Failed to process transaction', {
                txid,
                processingTime: errorTime,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                rawTx: JSON.stringify(tx).substring(0, 1000) // First 1000 chars for debugging
            });
            
            // Emit error event for monitoring
            this.emit('transaction:error', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error',
                processingTime: errorTime
            });

            this.handleError(error);
        }
    }

    private async subscribe(fromBlock: number = this.START_BLOCK): Promise<void> {
        if (!this.jungleBus) {
            throw new Error('JungleBus client not initialized');
        }

        try {
            logger.info('Subscribing to JungleBus', {
                fromBlock,
                subscriptionId: this.SUBSCRIPTION_ID
            });

            // Subscribe with specific filters for LOCK protocol transactions
            const subscription = await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                fromBlock,
                async (tx: any) => {
                    try {
                        // Log every transaction we receive
                        logger.debug('Received transaction from JungleBus', {
                            txid: tx?.id,
                            blockHeight: tx?.block_height,
                            hasData: !!tx?.data,
                            dataLength: tx?.data?.length,
                            data: JSON.stringify(tx?.data)
                        });

                        // Only proceed if it's a valid transaction
                        if (!this.isValidTransaction(tx)) {
                            return;
                        }

                        logger.info('Valid transaction received', {
                            txid: tx.id,
                            blockHeight: tx.block_height
                        });

                        // Hand over to parser
                        const parsedTx = await this.parser.parseTransaction(tx);
                        if (parsedTx) {
                            await this.dbClient.saveTransaction(parsedTx);
                            logger.info('Transaction processed successfully', {
                                txid: tx.id,
                                blockHeight: tx.block_height
                            });
                        }
                    } catch (error) {
                        logger.error('Error processing transaction', {
                            error: error instanceof Error ? error.message : 'Unknown error',
                            txid: tx?.id
                        });
                    }
                },
                (status: any) => {
                    logger.info('Subscription status update', {
                        ...status,
                        currentBlock: status?.block,
                        timestamp: new Date().toISOString()
                    });
                },
                (error: any) => {
                    logger.error('Subscription error', {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                },
                { // Add filters
                    find: ['app=lockd.app'],
                    findOpcodes: ['OP_RETURN'],
                    includeMempool: false
                }
            );

            const subscriptionId = randomUUID();
            this.subscriptions.set(subscriptionId, subscription);
            logger.info('Successfully subscribed to JungleBus', {
                subscriptionId,
                fromBlock
            });

        } catch (error) {
            logger.error('Failed to subscribe to JungleBus', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private isValidTransaction(tx: any): boolean {
        // Log raw transaction data
        logger.debug('Raw transaction data', {
            txid: tx?.id,
            block_height: tx?.block_height,
            data: tx?.data,
            raw: JSON.stringify(tx)
        });

        // Basic validation of transaction structure
        if (!tx || typeof tx !== 'object') {
            logger.debug('Invalid transaction: not an object', { tx });
            return false;
        }

        if (!tx.id || !tx.block_height || !tx.block_time) {
            logger.debug('Invalid transaction: missing required fields', {
                hasId: !!tx.id,
                hasBlockHeight: !!tx.block_height,
                hasBlockTime: !!tx.block_time,
                txid: tx?.id,
                blockHeight: tx?.block_height,
                blockTime: tx?.block_time
            });
            return false;
        }

        if (!Array.isArray(tx.data)) {
            logger.debug('Invalid transaction: data is not an array', {
                txid: tx.id,
                dataType: typeof tx.data,
                data: tx.data
            });
            return false;
        }

        // Log all transaction data for debugging
        logger.debug('Transaction data received', {
            txid: tx.id,
            blockHeight: tx.block_height,
            data: tx.data,
            timestamp: new Date(tx.block_time * 1000).toISOString()
        });

        // Check if this is a LOCK protocol transaction
        const isLockApp = tx.data.some((d: string) => {
            const isMatch = d === 'app=lockd.app';
            logger.debug('Checking data item', {
                data: d,
                isMatch,
                txid: tx.id
            });
            return isMatch;
        });

        if (!isLockApp) {
            logger.debug('Not a LOCK protocol transaction', {
                txid: tx.id,
                data: tx.data
            });
            return false;
        }

        // Log detected transaction
        logger.info('TX DETECTED', {
            txid: tx.id,
            blockHeight: tx.block_height,
            timestamp: new Date(tx.block_time * 1000).toISOString()
        });

        return true;
    }

    private createJungleBusClient(): void {
        const startTime = Date.now();
        logger.debug('Creating new JungleBus client', {
            server: 'junglebus.gorillapool.io',
            configSubscriptionId: this.SUBSCRIPTION_ID,
            currentSubscriptionId: this.SUBSCRIPTION_ID,
            startTime: new Date(startTime).toISOString()
        });

        this.jungleBus = new JungleBusClient(this.API_BASE_URL);
        this.isConnected = true;

        const initTime = Date.now() - startTime;
        logger.debug('JungleBus client created', {
            clientState: 'initialized',
            initializationTime: initTime
        });
    }

    private async handleError(error: unknown): Promise<void> {
        const startTime = Date.now();
        
        logger.debug('Handling error', {
            retryCount: this.retryCount,
            maxRetries: this.MAX_RETRIES,
            isConnected: this.isConnected,
            hasSubscription: !!this.subscriptions.size,
            timestamp: new Date(startTime).toISOString()
        });

        this.emit('scanner:error', {
            error: error instanceof Error ? error : new Error('Unknown error'),
            retryCount: this.retryCount,
            timestamp: new Date(startTime).toISOString()
        });

        if (this.retryCount < this.MAX_RETRIES) {
            this.retryCount++;
            const retryDelay = this.RETRY_DELAY * this.retryCount;
            
            logger.info('Retrying connection', {
                attempt: this.retryCount,
                delayMs: retryDelay,
                timestamp: new Date().toISOString()
            });
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            
            logger.debug('Retry delay complete, attempting restart', {
                attempt: this.retryCount,
                delayMs: retryDelay,
                totalErrorHandlingTime: Date.now() - startTime
            });
            
            await this.start();
        } else {
            logger.error('Max retries exceeded', {
                maxRetries: this.MAX_RETRIES,
                totalAttempts: this.retryCount,
                totalErrorHandlingTime: Date.now() - startTime
            });
            throw new Error('Max retries exceeded');
        }
    }

    private async fetchCompleteTransaction(txid: string): Promise<any> {
        try {
            logger.debug('Fetching complete transaction data', { txid });
            const response = await fetch(`${this.API_BASE_URL}/transaction/get/${txid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch transaction: ${response.statusText}`);
            }
            const data = await response.json();
            logger.debug('Fetched complete transaction data', { 
                txid,
                hasInputs: !!data.inputs?.length,
                inputCount: data.inputs?.length || 0,
                hasOutputs: !!data.outputs?.length,
                outputCount: data.outputs?.length || 0,
                blockHeight: data.block?.height,
                // Log sample of input and output data
                sampleInput: data.inputs?.[0] ? {
                    hasScript: !!data.inputs[0].inputScript,
                    scriptLength: data.inputs[0].inputScript?.length || 0,
                    scriptPreview: data.inputs[0].inputScript?.substring(0, 50) + '...',
                    prevTxHash: data.inputs[0].previousTransactionHash,
                    prevTxIndex: data.inputs[0].previousTransactionOutputIndex
                } : null,
                sampleOutput: data.outputs?.[0] ? {
                    hasScript: !!data.outputs[0].outputScript,
                    scriptLength: data.outputs[0].outputScript?.length || 0,
                    scriptPreview: data.outputs[0].outputScript?.substring(0, 50) + '...',
                    value: data.outputs[0].value,
                    address: data.outputs[0].address
                } : null
            });
            return data;
        } catch (error) {
            logger.error('Error fetching complete transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    public async start(): Promise<void> {
        try {
            logger.debug('Starting scanner', {
                isConnected: this.isConnected,
                hasClient: !!this.jungleBus,
                hasSubscription: !!this.subscriptions.size
            });

            // Ensure clean state before starting
            await this.stop();

            // Create JungleBus client and subscribe
            this.createJungleBusClient();
            await this.subscribe();

        } catch (error) {
            logger.error('Failed to start scanner', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    public async connect(): Promise<void> {
        try {
            if (!this.jungleBus) {
                throw new Error('JungleBus client not initialized');
            }

            logger.info('Connecting to JungleBus');
            // Removed connect call as it's not needed with the new JungleBus client interface
            this.isConnected = true;
            logger.info('Successfully connected to JungleBus');

        } catch (error) {
            logger.error('Failed to connect to JungleBus', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            logger.debug('Stopping scanner', {
                isConnected: this.isConnected,
                hasClient: !!this.jungleBus,
                hasSubscription: !!this.subscriptions.size
            });

            if (this.jungleBus) {
                try {
                    // Removed disconnect call as it's not needed with the new JungleBus client interface
                    this.jungleBus = null;
                    this.subscriptions.clear();
                } catch (error) {
                    logger.error('Error disconnecting from JungleBus', {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            if (this.isConnected) {
                await this.dbClient.disconnect();
                this.isConnected = false;
                logger.info('Scanner stopped');
            }
        } catch (error) {
            logger.error('Error stopping scanner', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
}

// Check if this file is being run directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (process.env.NODE_ENV !== 'test' && isMainModule) {
    const parser = new TransactionParser();
    const dbClient = new DbClient();
    const scanner = new Scanner(parser, dbClient);
    scanner.start().catch(error => {
        logger.error('Failed to start scanner', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    });

    // Handle process termination
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT. Shutting down...');
        await scanner.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM. Shutting down...');
        await scanner.stop();
        process.exit(0);
    });
}