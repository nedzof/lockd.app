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

    private async handleTransaction(tx: Transaction): Promise<void> {
        try {
            // Log raw transaction for debugging
            logger.debug('Raw transaction received', {
                id: tx.id,
                hash: tx.transaction?.hash,
                outputCount: tx.transaction?.outputs?.length,
                blockHeight: tx.block?.height,
                blockHash: tx.block?.hash,
                timestamp: tx.block?.timestamp
            });

            // Emit raw transaction
            this.emit('transaction', tx);

            // Parse transaction
            const parsedTx = await this.parser.parseTransaction(tx);
            if (parsedTx) {
                // Log parsed transaction details
                logger.debug('Transaction parsed', {
                    txid: parsedTx.txid,
                    type: parsedTx.type,
                    blockHeight: parsedTx.blockHeight,
                    timestamp: parsedTx.timestamp,
                    dataKeys: Object.keys(parsedTx.data || {})
                });

                // Emit parsed transaction
                this.emit('transaction:parsed', parsedTx);

                // Save to database with retry logic
                await this.dbClient.saveTransaction(parsedTx).catch(async (error) => {
                    if (error.code === '23505') { // Unique violation
                        logger.warn('Duplicate transaction detected', { txid: parsedTx.txid });
                    } else {
                        throw error;
                    }
                });
            } else {
                logger.debug('Transaction parsing failed or returned null', {
                    id: tx.id,
                    hash: tx.transaction?.hash
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
                logger.debug('Raw JungleBus message:', { msg });
                try {
                    const tx: Transaction = {
                        id: msg.id,
                        transaction: msg.transaction,
                        block: msg.block
                    };
                    await this.handleTransaction(tx);
                } catch (error) {
                    logger.error('Error in onTransaction', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined
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
    
    // Handle cleanup on exit
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT. Cleaning up...');
        await scanner.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM. Cleaning up...');
        await scanner.stop();
        process.exit(0);
    });

    scanner.start().catch(error => {
        logger.error('Scanner failed to start', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
    });
}