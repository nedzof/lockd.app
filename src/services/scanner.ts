import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { DbClient } from './dbClient.js';
import { TransactionParser } from './parser.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from './config.js';

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
                logger.info(' JungleBus CONNECTED', ctx);
            },
            onConnecting: (ctx) => {
                logger.info(' JungleBus CONNECTING', ctx);
            },
            onDisconnected: (ctx) => {
                logger.error(' JungleBus DISCONNECTED', ctx);
            },
            onError: (ctx) => {
                logger.error(' JungleBus ERROR', ctx);
            },
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        const txid = tx.transaction?.hash || tx.hash;
        if (!txid) return;

        try {
            logger.info(' TRANSACTION RECEIVED', { txid });
            logger.info(' Passing to parser...', { txid });
            await this.parser.parseTransaction(txid);
        } catch (error) {
            logger.error(' Error processing transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private handleStatus(message: any): void {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info(' BLOCK DONE', { block: message.block });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info(' WAITING for new block', message);
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn(' REORG detected', message);
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error(' STATUS ERROR', message);
        }
    }

    private handleError(error: any): void {
        logger.error(' SUBSCRIPTION ERROR', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    public async start(): Promise<void> {
        try {
            logger.info(' STARTING SCANNER', {
                startBlock: this.START_BLOCK,
                subscriptionId: this.SUBSCRIPTION_ID
            });

            await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                this.handleTransaction.bind(this),
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleTransaction.bind(this) // Same handler for mempool
            );
            
            logger.info(' SCANNER STARTED');
        } catch (error) {
            logger.error(' Failed to start scanner', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            logger.info(' STOPPING SCANNER');
            await this.jungleBus.Disconnect();
            logger.info(' SCANNER STOPPED');
        } catch (error) {
            logger.error(' Failed to stop scanner', {
                error: error instanceof Error ? error.message : 'Unknown error'
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