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
        this.parser = new TransactionParser();
        this.dbClient = new DBClient();
        
        this.client = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: "json",
            onConnected: (ctx) => {
                logger.info("Connected to JungleBus", { context: ctx });
            },
            onConnecting: (ctx) => {
                logger.info("Connecting to JungleBus", { context: ctx });
            },
            onDisconnected: (ctx) => {
                logger.warn("Disconnected from JungleBus", { context: ctx });
            },
            onError: (ctx) => {
                logger.error("JungleBus error", { error: ctx });
            },
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        try {
            const parsedTx = await this.parser.parseTransaction(tx);
            if (parsedTx) {
                await this.dbClient.processTransaction(parsedTx);
            }
        } catch (error) {
            logger.error('Error handling transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid: tx.id
            });
        }
    }

    private handleStatus(message: any) {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info("Block processing complete", { block: message.block });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info("Waiting for new block", { message });
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn("Reorg detected", { message });
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error("Status error", { message });
        }
    }

    private handleError(error: any) {
        logger.error('Subscription error', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    async start() {
        try {
            logger.info('Starting scanner...', { startBlock: this.startBlock });
            
            await this.client.Subscribe(
                this.subscriptionId,
                this.startBlock,
                this.handleTransaction.bind(this),
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleTransaction.bind(this) // Same handler for mempool transactions
            );
            
            logger.info('Scanner started successfully');
        } catch (error) {
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