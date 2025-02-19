import { Centrifuge } from 'centrifuge';
import { TransactionParser } from './parser';
import { DBClient } from './dbClient';
import { logger } from '../utils/logger';

export class Scanner {
    private centrifuge: Centrifuge;
    private parser: TransactionParser;
    private dbClient: DBClient;
    private readonly subscriptionId = '2177e79197422e0d162a685bb6fcc77c67f55a1920869d7c7685b0642043eb9c';
    private readonly startBlock = 882000;

    constructor() {
        this.centrifuge = new Centrifuge('wss://junglebus.gorillapool.io/connection/websocket', {
            debug: true
        });
        this.parser = new TransactionParser();
        this.dbClient = new DBClient();

        this.setupEventHandlers();
    }

    private setupEventHandlers() {
        this.centrifuge.on('connect', (ctx) => {
            logger.info('Connected to Centrifuge', { context: ctx });
            this.subscribeToChannels();
        });

        this.centrifuge.on('disconnect', (ctx) => {
            logger.warn('Disconnected from Centrifuge', { context: ctx });
        });

        this.centrifuge.on('error', (ctx) => {
            logger.error('Centrifuge error', { context: ctx });
        });
    }

    private subscribeToChannels() {
        // Subscribe to block channel
        const blockChannel = `query:${this.subscriptionId}:${this.startBlock}`;
        const sub = this.centrifuge.subscribe(blockChannel);

        sub.on('publish', async (ctx) => {
            try {
                const tx = ctx.data;
                logger.info('Received transaction', { txid: tx.id });
                
                const parsedTx = await this.parser.parseTransaction(tx);
                if (parsedTx) {
                    await this.dbClient.saveTransaction(parsedTx);
                    logger.info('Transaction processed and saved', { txid: tx.id });
                }
            } catch (error) {
                logger.error('Error processing transaction', { error, context: ctx });
            }
        });

        sub.on('error', (ctx) => {
            logger.error('Subscription error', { context: ctx });
        });

        // Subscribe to mempool channel
        const mempoolChannel = `query:${this.subscriptionId}:mempool`;
        const mempoolSub = this.centrifuge.subscribe(mempoolChannel);

        mempoolSub.on('publish', async (ctx) => {
            try {
                const tx = ctx.data;
                logger.info('Received mempool transaction', { txid: tx.id });
                
                const parsedTx = await this.parser.parseTransaction(tx);
                if (parsedTx) {
                    await this.dbClient.saveTransaction(parsedTx);
                    logger.info('Mempool transaction processed and saved', { txid: tx.id });
                }
            } catch (error) {
                logger.error('Error processing mempool transaction', { error, context: ctx });
            }
        });

        // Subscribe to control channel
        const controlChannel = `query:${this.subscriptionId}:control`;
        const controlSub = this.centrifuge.subscribe(controlChannel);

        controlSub.on('publish', (ctx) => {
            const message = ctx.data;
            if (message.type === 'block_done') {
                logger.info('Block processing completed', { block: message.block });
            } else if (message.type === 'waiting') {
                logger.info('Waiting for new block...', { message });
            } else if (message.type === 'reorg') {
                logger.warn('Reorg detected', { message });
                // TODO: Handle reorg by removing affected transactions
            }
        });
    }

    public async start() {
        try {
            logger.info('Starting scanner...', { startBlock: this.startBlock });
            this.centrifuge.connect();
        } catch (error) {
            logger.error('Error starting scanner', { error });
            throw error;
        }
    }

    public async stop() {
        try {
            logger.info('Stopping scanner...');
            this.centrifuge.disconnect();
        } catch (error) {
            logger.error('Error stopping scanner', { error });
            throw error;
        }
    }
}