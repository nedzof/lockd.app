import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { DbClient } from './dbClient';
import { TransactionParser } from './parser';
import { logger } from '../utils/logger';
import { CONFIG } from './config';

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
                logger.info('JungleBus connected', ctx);
            },
            onConnecting: (ctx) => {
                logger.info('JungleBus connecting', ctx);
            },
            onDisconnected: (ctx) => {
                logger.error('JungleBus disconnected', ctx);
            },
            onError: (ctx) => {
                logger.error('JungleBus error', ctx);
            },
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        const txid = tx.transaction?.hash || tx.hash;
        if (!txid) return;

        try {
            await this.parser.parseTransaction(txid);
        } catch (error) {
            logger.error('Error processing transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private handleStatus(message: any): void {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info('Block processing completed', { block: message.block });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info('Waiting for new block', message);
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn('Chain reorganization detected', message);
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error('JungleBus status error', message);
        }
    }

    private handleError(error: any): void {
        logger.error('JungleBus subscription error', {
            error: error instanceof Error ? error.message : 'Unknown error'
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
                subscriptionId: this.SUBSCRIPTION_ID
            });
        } catch (error) {
            logger.error('Failed to start scanner', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            await this.jungleBus.Disconnect();
            logger.info('Scanner stopped');
        } catch (error) {
            logger.error('Failed to stop scanner', {
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