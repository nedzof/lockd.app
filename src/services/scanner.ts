import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { DbClient } from './dbClient.js';
import { TransactionParser } from './parser.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from './config.js';

// Define event types for better logging
enum ScannerEvent {
    CONNECTED = 'CONNECTED',
    CONNECTING = 'CONNECTING',
    DISCONNECTED = 'DISCONNECTED',
    ERROR = 'ERROR',
    BLOCK_DONE = 'BLOCK_DONE',
    WAITING = 'WAITING',
    REORG = 'REORG',
    TRANSACTION = 'TRANSACTION',
    STATUS = 'STATUS'
}

export class Scanner {
    private jungleBus: JungleBusClient;
    private dbClient: DbClient;
    private parser: TransactionParser;
    private readonly START_BLOCK = 883000;
    private readonly END_BLOCK = 884500;
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;
    private readonly TRACKED_TRANSACTIONS = [
        'b132ddbc21f687f8b782b7a9f426aecd7e9cd8d47d904a068257c746bfa9873d',
        '355b4989bb76ac9dc1d72b07861d3fa1e58b2f0bddb588ddaa4897226c132df4',
        '68b291029b9aee6ba305daac6402b40d2694423b3d10e34ec6c9fb9c61ed327e'
    ];

    constructor(parser: TransactionParser, dbClient: DbClient) {
        this.dbClient = dbClient;
        this.parser = parser;
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            onConnected: (ctx) => {
                logger.info(`EVENT: ${ScannerEvent.CONNECTED}`, {
                    ...ctx,
                    timestamp: new Date().toISOString()
                });
            },
            onError: (error) => {
                logger.error(`EVENT: ${ScannerEvent.ERROR}`, {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        try {
            // Try to get transaction ID from various possible locations
            const txid = tx.transaction?.hash || tx.hash || tx.id;
            if (!txid) {
                logger.warn('Transaction without ID', {
                    tx: JSON.stringify(tx),
                    timestamp: new Date().toISOString()
                });
                return;
            }

            const blockHeight = tx.block?.height || tx.height || tx.block_height;
            
            // Skip if we're past our end block
            if (blockHeight > this.END_BLOCK) {
                logger.info('Reached end block, stopping scanner', {
                    endBlock: this.END_BLOCK,
                    currentBlock: blockHeight,
                    timestamp: new Date().toISOString()
                });
                process.exit(0);
            }

            // Check if this is one of our tracked transactions
            if (this.TRACKED_TRANSACTIONS.includes(txid)) {
                logger.info('Found tracked transaction!', {
                    txid,
                    blockHeight,
                    rawTx: JSON.stringify(tx),
                    timestamp: new Date().toISOString()
                });
            }

            // Log before parsing
            logger.debug('About to parse transaction', {
                txid,
                blockHeight,
                timestamp: new Date().toISOString()
            });

            await this.parser.parseTransaction(txid);
            
            logger.info('Transaction processed', {
                txid,
                blockHeight,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error processing transaction', {
                tx: JSON.stringify(tx),
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    private handleStatus(status: any): void {
        logger.info(`EVENT: ${ScannerEvent.STATUS}`, {
            status: JSON.stringify(status),
            timestamp: new Date().toISOString()
        });

        // Log block height progress
        if (status.block) {
            logger.info('Block height update', {
                currentBlock: status.block,
                startBlock: this.START_BLOCK,
                progress: status.block - this.START_BLOCK,
                timestamp: new Date().toISOString()
            });
        }

        if (status.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info(`EVENT: ${ScannerEvent.BLOCK_DONE}`, { 
                block: status.block,
                timestamp: new Date().toISOString()
            });
        } else if (status.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info(`EVENT: ${ScannerEvent.WAITING}`, {
                message: status,
                timestamp: new Date().toISOString()
            });
        } else if (status.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn(`EVENT: ${ScannerEvent.REORG}`, {
                message: status,
                timestamp: new Date().toISOString()
            });
        } else if (status.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error(`EVENT: ${ScannerEvent.ERROR}`, {
                message: status,
                timestamp: new Date().toISOString()
            });
        }
    }

    private handleError(error: any): void {
        logger.error(`EVENT: ${ScannerEvent.ERROR}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }

    public async start(): Promise<void> {
        try {
            logger.info('Starting scanner with subscription', {
                startBlock: this.START_BLOCK,
                subscriptionId: this.SUBSCRIPTION_ID,
                timestamp: new Date().toISOString()
            });

            const options = {
                fromBlock: this.START_BLOCK,
                toBlock: this.END_BLOCK,
                includeMempool: false
            };

            logger.debug('Subscribing with options', {
                options,
                timestamp: new Date().toISOString()
            });

            await this.jungleBus.SubscribeToBlocks(
                this.START_BLOCK,
                (block: any) => {
                    logger.debug('Block received', {
                        block: JSON.stringify(block),
                        timestamp: new Date().toISOString()
                    });

                    if (block.transactions) {
                        for (const tx of block.transactions) {
                            this.handleTransaction(tx);
                        }
                    }
                },
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                options
            );
            
            logger.info('Scanner started', {
                startBlock: this.START_BLOCK,
                subscriptionId: this.SUBSCRIPTION_ID,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to start scanner', {
                event: ScannerEvent.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            await this.jungleBus.Disconnect();
            logger.info(`EVENT: ${ScannerEvent.DISCONNECTED}`, {
                message: 'Scanner stopped',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to stop scanner', {
                event: ScannerEvent.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}

// Check if this file is being run directly
if (process.env.NODE_ENV !== 'test' && import.meta.url === new URL(import.meta.url).href) {
    const parser = new TransactionParser(new DbClient());
    const dbClient = new DbClient();
    const scanner = new Scanner(parser, dbClient);
    scanner.start().catch(console.error);
}