import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { TransactionParser } from './parser';
import { DBClient } from './dbClient';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

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

export class Scanner extends EventEmitter {
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
        super();
        this.jungleBus = jungleBus;
        this.parser = parser;
        this.dbClient = dbClient;

        // Set up error handling for the emitter
        this.on('error', (error) => {
            logger.error('Scanner error:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
        });
    }

    private async handleTransaction(tx: Transaction): Promise<void> {
        try {
            const parsedTx = await this.parser.parseTransaction(tx);
            this.emit('transaction', parsedTx);
            
            this.transactionBatch.push(parsedTx);
            if (this.transactionBatch.length >= this.BATCH_SIZE) {
                await this.processBatch();
            }
        } catch (error) {
            this.emit('error', { tx, error });
            logger.error('Error handling transaction:', {
                txid: tx.tx?.h,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async processBatch(): Promise<void> {
        if (this.transactionBatch.length === 0) return;

        let retries = 0;
        while (retries < this.MAX_RETRIES) {
            try {
                await this.dbClient.insertTransactions(this.transactionBatch);
                this.transactionBatch = [];
                break;
            } catch (error) {
                retries++;
                if (retries === this.MAX_RETRIES) {
                    this.emit('error', { 
                        type: 'BATCH_PROCESSING_FAILED', 
                        batchSize: this.transactionBatch.length,
                        error 
                    });
                    this.transactionBatch = []; // Clear failed batch
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
    }

    public async start(): Promise<void> {
        logger.info('Starting scanner with config', {
            batchSize: this.BATCH_SIZE,
            maxRetries: this.MAX_RETRIES,
            startBlock: 882000
        });

        try {
            const onPublish = async (tx: Transaction) => {
                await this.handleTransaction(tx);
            };

            const onStatus = (message: any) => {
                if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                    this.emit('blockDone', message.block);
                    this.processBatch().catch(error => this.emit('error', error));
                } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
                    this.emit('waiting', message);
                } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                    this.emit('reorg', message);
                } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
                    this.emit('error', message);
                }
            };

            const onError = (error: Error) => {
                this.emit('error', error);
            };

            const onMempool = async (tx: Transaction) => {
                await this.handleTransaction(tx);
            };

            await this.jungleBus.Subscribe(
                "2177e79197422e0d162a685bb6fcc77c67f55a1920869d7c7685b0642043eb9c",
                882000,
                onPublish,
                onStatus,
                onError,
                onMempool
            );
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            await this.processBatch(); // Process any remaining transactions
            // Additional cleanup if needed
        } catch (error) {
            this.emit('error', error);
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