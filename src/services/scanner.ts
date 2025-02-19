import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { TransactionParser } from './parser';
import { DBClient } from './dbClient';
import { logger } from '../utils/logger';

export class Scanner {
    private client: JungleBusClient;
    private parser: TransactionParser;
    private dbClient: DBClient;
    readonly subscriptionId = '2177e79197422e0d162a685bb6fcc77c67f55a1920869d7c7685b0642043eb9c';
    readonly startBlock = 882000;

    constructor() {
        console.log('Initializing Scanner components...');
        
        console.log('Creating TransactionParser...');
        this.parser = new TransactionParser();
        
        console.log('Creating DBClient...');
        this.dbClient = new DBClient();
        
        console.log('Creating JungleBusClient...');
        this.client = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: "json",
            onConnected: (ctx) => {
                console.log("Connected to JungleBus:", ctx);
                logger.info("Connected to JungleBus", { context: ctx });
            },
            onConnecting: (ctx) => {
                console.log("Connecting to JungleBus:", ctx);
                logger.info("Connecting to JungleBus", { context: ctx });
            },
            onDisconnected: (ctx) => {
                console.log("Disconnected from JungleBus:", ctx);
                logger.warn("Disconnected from JungleBus", { context: ctx });
            },
            onError: (ctx) => {
                console.error("JungleBus error:", ctx);
                logger.error("JungleBus error", { error: ctx });
            },
        });
        
        console.log('Scanner initialization complete');
    }

    private async handleTransaction(tx: any): Promise<void> {
        try {
            // Track block-level statistics
            if (tx.blk?.i !== this.currentBlock) {
                if (this.currentBlock !== null) {
                    logger.info('Block statistics', {
                        block: this.currentBlock,
                        totalTransactions: this.blockTransactionCount,
                        lockdTransactions: this.blockLockdTransactionCount,
                        time: new Date().toISOString()
                    });
                }
                this.currentBlock = tx.blk?.i;
                this.blockTransactionCount = 0;
                this.blockLockdTransactionCount = 0;
            }
            this.blockTransactionCount++;

            logger.info('Processing transaction', { 
                txid: tx.id,
                block: tx.blk?.i,
                time: new Date().toISOString()
            });

            // Step 1: Parse the transaction
            console.log('Parsing transaction...');
            const parsedTx = await this.parser.parseTransaction(tx);
            
            if (!parsedTx) {
                logger.debug('Transaction skipped - not a Lockd transaction', { 
                    txid: tx.id,
                    block: tx.blk?.i
                });
                return;
            }

            // Log parsed transaction details
            const txInfo = Array.isArray(parsedTx) ? parsedTx : [parsedTx];
            this.blockLockdTransactionCount += txInfo.length;

            logger.info('Transaction parsed successfully', {
                txid: tx.id,
                block: tx.blk?.i,
                count: txInfo.length,
                types: txInfo.map(t => t.type),
                postIds: txInfo.map(t => t.metadata?.postId),
                time: new Date().toISOString()
            });

            // Step 2: Save to database
            console.log('Saving transaction to database...');
            await this.dbClient.processTransaction(parsedTx);
            
            logger.info('Transaction processed successfully', { 
                txid: tx.id,
                block: tx.blk?.i,
                count: txInfo.length,
                types: txInfo.map(t => t.type),
                time: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error handling transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                txid: tx.id,
                block: tx.blk?.i,
                stack: error instanceof Error ? error.stack : undefined,
                time: new Date().toISOString()
            });
            
            // Don't throw the error - we want to continue processing other transactions
            console.error('Error processing transaction:', tx.id, error);
        }
    }

    private handleStatus(message: any) {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info("Block processing complete", { 
                block: message.block,
                status: message.statusCode,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info("Waiting for new block", { 
                message,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn("Reorg detected", { 
                message,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error("Status error", { 
                message,
                time: new Date().toISOString()
            });
        }
    }

    private handleError(error: any) {
        logger.error('Subscription error', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    private blockTransactionCount = 0;
    private blockLockdTransactionCount = 0;
    private currentBlock: number | null = null;

    async start() {
        try {
            console.log('Starting scanner...', { startBlock: this.startBlock });
            logger.info('Starting scanner...', { startBlock: this.startBlock });
            
            console.log('Connecting to database...');
            await this.dbClient.connect();
            console.log('Database connected');
            
            console.log('Starting JungleBus subscription...');
            await this.client.Subscribe(
                this.subscriptionId,
                this.startBlock,
                this.handleTransaction.bind(this),
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleTransaction.bind(this) // Same handler for mempool transactions
            );
            
            console.log('JungleBus subscription started');
            logger.info('Scanner started successfully');
        } catch (error) {
            console.error('Error starting scanner:', error);
            logger.error('Error starting scanner', {
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    async stop() {
        try {
            await this.client.Disconnect();
            logger.info('Scanner stopped');
        } catch (error) {
            logger.error('Error stopping scanner', {
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }
}

// Main entry point
const runScanner = async () => {
    console.log('Scanner script starting...');
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });

    const scanner = new Scanner();
    console.log('Scanner instance created');
    
    try {
        await scanner.start();
        console.log('Scanner started successfully. Keeping process alive...');
        
        // Keep the process alive
        process.stdin.resume();
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Received SIGINT. Shutting down...');
            await scanner.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start scanner:', error);
        process.exit(1);
    }
};

// Only run the scanner if this file is being run directly
if (process.env.NODE_ENV !== 'test') {
    runScanner().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}