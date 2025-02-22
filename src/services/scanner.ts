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
    TRANSACTION = 'TRANSACTION'
}

export class Scanner {
    private jungleBus: JungleBusClient;
    private dbClient: DbClient;
    private parser: TransactionParser;
    private readonly START_BLOCK = 883849;
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;
    private readonly TRACKED_TRANSACTIONS = [
        'b132ddbc21f687f8b782b7a9f426aecd7e9cd8d47d904a068257c746bfa9873d',
        '355b4989bb76ac9dc1d72b07861d3fa1e58b2f0bddb588ddaa4897226c132df4',
        '68b291029b9aee6ba305daac6402b40d2694423b3d10e34ec6c9fb9c61ed327e'
    ];

    constructor(parser: TransactionParser, dbClient: DbClient) {
        this.dbClient = dbClient;
        this.parser = parser;

        // Initialize JungleBus client
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            onConnected: (ctx) => {
                logger.info(`EVENT: ${ScannerEvent.CONNECTED}`, ctx);
            },
            onConnecting: (ctx) => {
                logger.info(`EVENT: ${ScannerEvent.CONNECTING}`, ctx);
            },
            onDisconnected: (ctx) => {
                logger.error(`EVENT: ${ScannerEvent.DISCONNECTED}`, ctx);
            },
            onError: (ctx) => {
                logger.error(`EVENT: ${ScannerEvent.ERROR}`, ctx);
            },
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        const txid = tx.transaction?.hash || tx.hash || tx.id;
        if (!txid) {
            logger.warn(`EVENT: ${ScannerEvent.TRANSACTION}`, {
                message: 'Received transaction without ID',
                tx: JSON.stringify(tx).substring(0, 200),
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Log full transaction data for debugging
        logger.debug('Full transaction data', {
            txid,
            blockHeight: tx.block?.height || tx.height || tx.block_height,
            data: tx.data,
            outputs: tx.outputs,
            transaction: tx.transaction,
            timestamp: new Date().toISOString()
        });

        // Check if this is one of our tracked transactions
        if (this.TRACKED_TRANSACTIONS.includes(txid)) {
            logger.info('Found tracked transaction!', {
                txid,
                blockHeight: tx.block?.height || tx.height || tx.block_height,
                timestamp: new Date().toISOString()
            });
        }

        try {
            logger.info(`EVENT: ${ScannerEvent.TRANSACTION}`, {
                txid,
                blockHeight: tx.block?.height || tx.height || tx.block_height,
                message: 'PARSING TRANSACTION',
                data: tx.data,
                timestamp: new Date().toISOString()
            });

            await this.parser.parseTransaction(txid);
            
            logger.info('Transaction passed to parser successfully', {
                txid,
                blockHeight: tx.block?.height || tx.height || tx.block_height,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error processing transaction', {
                txid,
                event: ScannerEvent.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }

    private handleStatus(message: any): void {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info(`EVENT: ${ScannerEvent.BLOCK_DONE}`, { 
                block: message.block,
                timestamp: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info(`EVENT: ${ScannerEvent.WAITING}`, {
                message,
                timestamp: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn(`EVENT: ${ScannerEvent.REORG}`, {
                message,
                timestamp: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error(`EVENT: ${ScannerEvent.ERROR}`, {
                message,
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

            await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                (tx: any) => {
                    logger.debug('Raw transaction received', {
                        tx: JSON.stringify(tx).substring(0, 500),
                        timestamp: new Date().toISOString()
                    });
                    return this.handleTransaction(tx);
                },
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleTransaction.bind(this), // Same handler for mempool
                {
                    find: ['app=lockd.app'],
                    findOpcodes: ['OP_RETURN'],
                    includeMempool: false
                }
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