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
    private readonly START_BLOCK = 883850;
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;

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
        const txid = tx.transaction?.hash || tx.hash;
        if (!txid) return;

        try {
            logger.info(`EVENT: ${ScannerEvent.TRANSACTION}`, {
                txid,
                message: 'PARSING TRANSACTION',
                timestamp: new Date().toISOString()
            });

            await this.parser.parseTransaction(txid);
            
            logger.info('Transaction passed to parser successfully', {
                txid,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error processing transaction', {
                txid,
                event: ScannerEvent.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error'
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
            await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                this.handleTransaction.bind(this),
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleTransaction.bind(this) // Same handler for mempool
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