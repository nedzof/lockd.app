import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { DbClient } from './dbClient';
import { TransactionParser } from './parser';
import { Transaction, JungleBusTransaction, ParsedTransaction, ScannerEvents } from './types';
import { logger } from '../utils/logger';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import { CONFIG } from './config';

export class Scanner extends EventEmitter {
    private jungleBus: JungleBusClient | null = null;
    private dbClient: DbClient;
    private parser: TransactionParser;
    private isConnected: boolean = false;
    private retryCount: number = 0;
    private subscription: any = null;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second
    private readonly START_BLOCK = 883008;
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
            inputCount: tx.transaction?.inputs?.length,
            outputCount: tx.transaction?.outputs?.length,
            processingStartTime: new Date(startTime).toISOString()
        });

        try {
            // Hand over to parser
            const parsedTx = await this.parser.parseTransaction(tx);
            
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

    private createJungleBusClient(): void {
        const startTime = Date.now();
        
        logger.debug('Creating new JungleBus client', {
            configSubscriptionId: CONFIG.JB_SUBSCRIPTION_ID,
            currentSubscriptionId: this.SUBSCRIPTION_ID,
            server: CONFIG.JB_SERVER,
            startTime: new Date(startTime).toISOString()
        });
        
        this.jungleBus = new JungleBusClient(CONFIG.JB_SERVER, {
            useSSL: true,
            onConnected: (ctx) => {
                const connectTime = Date.now() - startTime;
                logger.info('Connected to JungleBus', {
                    context: ctx,
                    connectionTime: connectTime,
                    timestamp: new Date().toISOString()
                });
                this.isConnected = true;
                this.retryCount = 0;
                this.emit('scanner:connected', {
                    connectionTime: connectTime,
                    context: ctx
                });
            },
            onConnecting: (ctx) => {
                logger.info('Connecting to JungleBus', {
                    context: ctx,
                    attemptTime: Date.now() - startTime,
                    retryCount: this.retryCount
                });
                this.emit('scanner:connecting');
            },
            onDisconnected: (ctx) => {
                logger.warn('Disconnected from JungleBus', {
                    context: ctx,
                    connectionDuration: Date.now() - startTime,
                    wasConnected: this.isConnected,
                    retryCount: this.retryCount
                });
                this.isConnected = false;
                this.emit('scanner:disconnected', {
                    context: ctx,
                    timestamp: new Date().toISOString()
                });
            },
            onError: (error) => {
                logger.error('JungleBus connection error', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    context: error,
                    timeSinceStart: Date.now() - startTime,
                    wasConnected: this.isConnected,
                    retryCount: this.retryCount
                });
                this.handleError(error);
            }
        });

        logger.debug('JungleBus client created', {
            clientState: this.jungleBus ? 'initialized' : 'failed',
            initializationTime: Date.now() - startTime
        });
    }

    private async subscribe(): Promise<void> {
        const startTime = Date.now();
        try {
            if (!this.jungleBus) {
                throw new Error('JungleBus client not initialized');
            }

            logger.debug('Attempting to subscribe', {
                subscriptionId: this.SUBSCRIPTION_ID,
                startBlock: this.START_BLOCK,
                timestamp: new Date(startTime).toISOString()
            });

            // Handler for confirmed transactions
            const onPublish = async (tx: any) => {
                const txid = tx.transaction?.hash || tx.hash;
                const blockHeight = tx.block?.height || tx.height;
                
                logger.debug('Confirmed transaction received', {
                    txid,
                    blockHeight,
                    timestamp: new Date().toISOString(),
                    timeSinceSubscription: Date.now() - startTime
                });

                await this.handleTransaction(tx);
            };

            // Handler for mempool transactions
            const onMempool = async (tx: any) => {
                const txid = tx.transaction?.hash || tx.hash;
                
                logger.debug('Mempool transaction received', {
                    txid,
                    timestamp: new Date().toISOString(),
                    timeSinceSubscription: Date.now() - startTime
                });

                await this.handleTransaction(tx);
            };

            // Handler for status messages
            const onStatus = (message: any) => {
                const statusTime = Date.now() - startTime;
                
                if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                    logger.info('BLOCK DONE', {
                        block: message.block,
                        processingTime: statusTime,
                        timestamp: new Date().toISOString()
                    });
                    this.emit('block:complete', {
                        block: message.block,
                        processingTime: statusTime
                    });
                } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
                    logger.info('WAITING FOR NEW BLOCK...', {
                        message,
                        timeSinceSubscription: statusTime
                    });
                    this.emit('block:waiting', {
                        timeSinceSubscription: statusTime
                    });
                } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                    logger.warn('REORG TRIGGERED', {
                        message,
                        timeSinceSubscription: statusTime,
                        timestamp: new Date().toISOString()
                    });
                    this.emit('block:reorg', {
                        message,
                        timeSinceSubscription: statusTime
                    });
                } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
                    logger.error('Status error received', {
                        message,
                        timeSinceSubscription: statusTime,
                        timestamp: new Date().toISOString()
                    });
                    this.handleError(new Error(message.message || 'Unknown status error'));
                }
            };

            // Handler for subscription errors
            const onError = (error: Error) => {
                logger.error('Subscription error', {
                    error: error.message,
                    stack: error.stack,
                    timeSinceSubscription: Date.now() - startTime,
                    retryCount: this.retryCount
                });
                this.handleError(error);
            };

            // Subscribe to both confirmed and mempool transactions
            this.subscription = await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                onPublish,
                onStatus,
                onError,
                onMempool
            );

            const subscribeTime = Date.now() - startTime;
            logger.info('Successfully subscribed to JungleBus', {
                subscriptionId: this.SUBSCRIPTION_ID,
                fromBlock: this.START_BLOCK,
                subscriptionTime: subscribeTime,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            const errorTime = Date.now() - startTime;
            logger.error('Failed to subscribe', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                subscriptionAttemptTime: errorTime,
                retryCount: this.retryCount
            });
            throw error;
        }
    }

    private async handleError(error: unknown): Promise<void> {
        const startTime = Date.now();
        
        logger.debug('Handling error', {
            retryCount: this.retryCount,
            maxRetries: this.MAX_RETRIES,
            isConnected: this.isConnected,
            hasSubscription: !!this.subscription,
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
                hasSubscription: !!this.subscription
            });

            // Ensure clean state before starting
            await this.stop();
            
            // Create new JungleBus client
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

    public async stop(): Promise<void> {
        try {
            logger.debug('Stopping scanner', {
                isConnected: this.isConnected,
                hasClient: !!this.jungleBus,
                hasSubscription: !!this.subscription
            });

            if (this.jungleBus) {
                try {
                    await this.jungleBus.Disconnect();
                    logger.debug('JungleBus disconnected');
                } catch (error) {
                    logger.error('Error disconnecting from JungleBus', {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                this.jungleBus = null;
                this.subscription = null;
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