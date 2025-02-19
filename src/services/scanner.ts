import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { TransactionParser } from './parser';
import { DBClient } from './dbClient';
import { logger } from '../utils/logger';

// Log import verification
console.log('=== Import Verification ===');
console.log('JungleBusClient imported:', !!JungleBusClient);
console.log('ControlMessageStatusCode imported:', !!ControlMessageStatusCode);

interface Block {
    height: number;
    timestamp: string;
    tx: any[];
}

interface Transaction {
    tx: {
        h: string;
        raw: string;
        blk?: {
            i: number;
            t: number;
        };
    };
}

interface ParsedTransaction {
    txid: string;
    type: string;
    blockHeight?: number;
    blockTime?: number;
    senderAddress?: string;
    metadata: {
        postId: string;
        content: string;
        protocol?: string;
    };
}

export class Scanner {
    private jungleBus: JungleBusClient;
    private parser: TransactionParser;
    private dbClient: DBClient;
    private readonly BATCH_SIZE = 50;
    private readonly MAX_RETRIES = 3;
    private transactionBatch: any[] = [];

    constructor(
        jungleBus: JungleBusClient,
        parser: TransactionParser,
        dbClient: DBClient
    ) {
        this.jungleBus = jungleBus;
        this.parser = parser;
        this.dbClient = dbClient;
    }

    public async start(): Promise<void> {
        logger.info('Starting scanner with config', {
            batchSize: this.BATCH_SIZE,
            maxRetries: this.MAX_RETRIES,
            startBlock: 882000
        });

        try {
            logger.info('Starting JungleBus subscription...');
            
            // Define handlers following template pattern
            const onPublish = (tx: Transaction) => {
                console.log('=== Transaction Received ===');
                console.log('Transaction:', {
                    txid: tx.tx?.h,
                    hasRaw: !!tx.tx?.raw,
                    blockInfo: tx.tx?.blk
                });
                return this.handleTransaction(tx);
            };

            const onStatus = (message: any) => {
                console.log('=== Status Update ===');
                console.log('Status message:', {
                    type: typeof message,
                    statusCode: message.statusCode,
                    keys: Object.keys(message)
                });

                if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                    logger.info('Block processing complete', { block: message.block });
                } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
                    logger.info('Waiting for new block...', { message });
                } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                    logger.warn('Reorg triggered', { message });
                } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
                    logger.error('Status error', { error: message });
                }
            };

            const onError = (error: Error) => {
                console.log('=== Error Handler ===');
                console.log('Error:', {
                    type: typeof error,
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                logger.error('Subscription error', {
                    error: error.message,
                    stack: error.stack
                });
            };

            const onMempool = (tx: Transaction) => {
                console.log('=== Mempool Transaction ===');
                console.log('Mempool tx:', {
                    txid: tx.tx?.h,
                    hasRaw: !!tx.tx?.raw
                });
                return this.handleTransaction(tx);
            };

            // Subscribe using template pattern
            await this.jungleBus.Subscribe(
                "2177e79197422e0d162a685bb6fcc77c67f55a1920869d7c7685b0642043eb9c",
                882000,
                onPublish,
                onStatus,
                onError,
                onMempool
            );
        } catch (error) {
            logger.error('Error starting scanner', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async handleTransaction(tx: Transaction) {
        try {
            // Parse first
            const parsed = await this.parser.parseTransaction(tx);
            
            if (!parsed || parsed.length === 0) {
                logger.debug('No parsable Lockd data in transaction', { txid: tx.tx.h });
                return;
            }

            // Batch processing with retries
            let retries = 0;
            while (retries < this.MAX_RETRIES) {
                try {
                    await this.dbClient.insertTransactions(parsed);
                    logger.info('Successfully processed transaction batch', {
                        txid: tx.tx.h,
                        parsedCount: parsed.length
                    });
                    break;
                } catch (error) {
                    retries++;
                    logger.error(`Transaction insert failed (attempt ${retries})`, {
                        txid: tx.tx.h,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    if (retries === this.MAX_RETRIES) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** retries));
                }
            }
        } catch (error) {
            logger.error('Fatal error processing transaction', {
                txid: tx.tx.h,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    private handleStatus(message: any) {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info('Block processing complete', { block: message.block });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info('Waiting for new block...', { message });
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn('Reorg triggered', { message });
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error('Status error', { error: message });
        }
    }

    private handleError(error: Error) {
        logger.error('Subscription error', {
            error: error.message,
            stack: error.stack
        });
    }

    private handleMempool(tx: Transaction) {
        logger.debug('Mempool transaction received', { txid: tx.tx.h });
        this.handleTransaction(tx);
    }

    public async stop(): Promise<void> {
        try {
            // Process any remaining transactions in the batch
            if (this.transactionBatch.length > 0) {
                await this.processBatch();
            }
            await this.jungleBus.Disconnect();
        } catch (error) {
            logger.error('Error stopping scanner', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async processBatch() {
        if (this.transactionBatch.length === 0) return;

        const batch = [...this.transactionBatch];
        this.transactionBatch = [];

        try {
            for (const tx of batch) {
                await this.handleTransaction(tx);
            }
        } catch (error) {
            logger.error('Error processing batch', {
                batchSize: batch.length,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
}

// Only start the scanner if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });

    try {
        console.log('=== Creating JungleBus Client ===');
        const jungleBus = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            onConnected(ctx) {
                console.log("CONNECTED", ctx);
            },
            onConnecting(ctx) {
                console.log("CONNECTING", ctx);
            },
            onDisconnected(ctx) {
                console.log("DISCONNECTED", ctx);
            },
            onError(ctx) {
                console.error("ERROR", ctx);
            },
        });

        console.log('=== JungleBus Client Created ===');
        console.log('Client:', {
            type: typeof jungleBus,
            constructor: jungleBus.constructor.name,
            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(jungleBus))
        });

        const parser = new TransactionParser();
        const dbClient = new DBClient();

        const scanner = new Scanner(jungleBus, parser, dbClient);
        console.log('Scanner instance created');
        
        scanner.start().catch(error => {
            console.error('Error starting scanner:', error);
            process.exit(1);
        });
    } catch (error) {
        console.error('=== Initialization Error ===');
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            constructor: error.constructor?.name
        });
        process.exit(1);
    }
}