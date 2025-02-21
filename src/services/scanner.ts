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
    private readonly START_BLOCK = 882000;
    private readonly API_BASE_URL = 'https://junglebus.gorillapool.io/v1';
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;

    constructor() {
        super();
        this.dbClient = new DbClient();
        this.parser = new TransactionParser();

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

    private createJungleBusClient(): void {
        logger.debug('Creating new JungleBus client', {
            configSubscriptionId: CONFIG.JB_SUBSCRIPTION_ID,
            currentSubscriptionId: this.SUBSCRIPTION_ID,
            server: CONFIG.JB_SERVER
        });
        
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            onConnected: (ctx) => {
                logger.info('Connected to JungleBus', { context: ctx });
                this.isConnected = true;
                this.retryCount = 0;
            },
            onConnecting: (ctx) => {
                logger.info('Connecting to JungleBus', { context: ctx });
            },
            onDisconnected: (ctx) => {
                logger.warn('Disconnected from JungleBus', { context: ctx });
                this.isConnected = false;
            },
            onError: (error) => {
                logger.error('JungleBus connection error', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    context: error
                });
                this.handleError(error);
            }
        });

        logger.debug('JungleBus client created', {
            clientState: this.jungleBus ? 'initialized' : 'failed'
        });
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

    private async handleTransaction(tx: Transaction): Promise<void> {
        try {
            const txid = tx.transaction?.hash || tx.id;
            if (!txid) {
                logger.warn('Transaction has no id', { tx: JSON.stringify(tx) });
                return;
            }

            // Log raw transaction for debugging
            logger.debug('Raw transaction received', {
                id: tx.id,
                hash: txid,
                outputCount: tx.transaction?.outputs?.length,
                blockHeight: tx.block?.height,
                blockHash: tx.block?.hash,
                timestamp: tx.block?.timestamp
            });

            // Emit raw transaction
            this.emit('transaction', tx);

            // Fetch complete transaction data
            const completeTx = await this.fetchCompleteTransaction(txid);
            
            // Merge block data from original tx with complete tx data
            const enrichedTx: Transaction = {
                id: tx.id,
                transaction: completeTx,
                block: tx.block
            };

            // Parse transaction with complete data
            const parsedTx = await this.parser.parseTransaction(enrichedTx);
            if (parsedTx) {
                // Log parsed transaction details
                logger.debug('Transaction parsed', {
                    txid: parsedTx.txid,
                    type: parsedTx.type,
                    protocol: parsedTx.protocol,
                    blockHeight: parsedTx.blockHeight,
                    blockTime: parsedTx.blockTime,
                    contentKeys: Object.keys(parsedTx.content || {})
                });

                // Emit parsed transaction
                this.emit('transaction:parsed', parsedTx);

                // Process to database with retry logic
                await this.dbClient.processTransaction(parsedTx).catch(async (error) => {
                    if (error.code === '23505') { // Unique violation
                        logger.warn('Duplicate transaction detected', { txid: parsedTx.txid });
                    } else {
                        throw error;
                    }
                });
            } else {
                logger.debug('Transaction parsing failed or returned null', {
                    txid,
                    blockHeight: tx.block?.height
                });
            }
        } catch (error) {
            this.emit('transaction:error', { tx, error: error as Error });
            logger.error('Error processing transaction', {
                txid: tx.transaction?.hash || tx.id || 'unknown',
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    private async handleError(error: unknown): Promise<void> {
        logger.debug('Handling error', {
            retryCount: this.retryCount,
            maxRetries: this.MAX_RETRIES,
            isConnected: this.isConnected,
            hasSubscription: !!this.subscription
        });

        this.emit('scanner:error', error instanceof Error ? error : new Error('Unknown error'));

        if (this.retryCount < this.MAX_RETRIES) {
            this.retryCount++;
            logger.info('Retrying connection', { attempt: this.retryCount });
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * this.retryCount));
            await this.start();
        } else {
            throw new Error('Max retries exceeded');
        }
    }

    private async subscribe(): Promise<void> {
        try {
            if (!this.jungleBus) {
                throw new Error('JungleBus client not initialized');
            }

            logger.debug('Attempting to subscribe', {
                subscriptionId: this.SUBSCRIPTION_ID,
                startBlock: this.START_BLOCK
            });

            const onStatus = (message: any) => {
                if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                    logger.info('Block processing complete', { block: message.block });
                    this.emit('block:complete', message.block);
                } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
                    logger.info('Waiting for new block', { message });
                } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                    logger.warn('Reorg triggered', { message });
                } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
                    logger.error('Status error', { message });
                    this.handleError(new Error(message.message || 'Unknown status error'));
                }
            };

            const onTransaction = async (msg: any) => {
                logger.debug('Raw JungleBus message received:', {
                    msgId: msg.id,
                    hasTransaction: !!msg.transaction,
                    hasBlock: !!msg.block,
                    blockHeight: msg.block?.height,
                    blockHash: msg.block?.hash,
                    txHash: msg.transaction?.hash,
                    inputCount: msg.transaction?.inputs?.length,
                    outputCount: msg.transaction?.outputs?.length
                });

                try {
                    const tx: Transaction = {
                        id: msg.id,
                        transaction: msg.transaction,
                        block: msg.block
                    };

                    // Log transaction details
                    logger.debug('Processing transaction:', {
                        txid: tx.transaction?.hash || tx.id,
                        blockHeight: tx.block?.height,
                        blockTime: tx.block?.timestamp,
                        inputCount: tx.transaction?.inputs?.length || 0,
                        outputCount: tx.transaction?.outputs?.length || 0
                    });

                    await this.handleTransaction(tx);
                } catch (error) {
                    logger.error('Error in onTransaction', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined,
                        msgId: msg.id,
                        txHash: msg.transaction?.hash
                    });
                }
            };

            // Store subscription for cleanup
            const subscription = await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                onTransaction,
                onStatus,
                (error: Error) => this.handleError(error)
            );

            this.subscription = subscription;

            logger.info('Subscribed to JungleBus', {
                subscriptionId: this.SUBSCRIPTION_ID,
                fromBlock: this.START_BLOCK
            });
        } catch (error) {
            logger.error('Failed to subscribe', {
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
    const scanner = new Scanner();
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