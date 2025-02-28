import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { TransactionParser } from "./parser";
import { DbClient } from "./dbClient";
import { CONFIG } from "./config";
import { logger } from "../utils/logger";

export class Scanner {
    private readonly startBlock = 885675;  // Start earlier to catch all target blocks
    private readonly subscriptionId = CONFIG.JB_SUBSCRIPTION_ID;
    private readonly jungleBus: JungleBusClient;
    private readonly parser: TransactionParser;

    constructor(parser: TransactionParser, dbClient: DbClient) {
        this.parser = parser;
        this.jungleBus = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            onConnected: (ctx) => {
                logger.info("🔌 JungleBus CONNECTED", ctx);
            },
            onConnecting: (ctx) => {
                logger.info("🔄 JungleBus CONNECTING", ctx);
            },
            onDisconnected: (ctx) => {
                logger.info("❌ JungleBus DISCONNECTED", ctx);
            },
            onError: (ctx) => {
                logger.error("❌ JungleBus ERROR", ctx);
            },
        });
    }

    private async handleTransaction(tx: any): Promise<void> {
        // Try different ways to get the txid
        const txid = tx?.transaction?.hash || tx?.hash || tx?.id || tx?.txid;
        if (!txid) {
            return;
        }

        const block = tx?.block?.height || tx?.height || tx?.blockHeight;

        // Log the raw transaction structure
        logger.debug('📥 Raw transaction data:', {
            txid,
            block,
            hasTransaction: !!tx.transaction,
            hasOutputs: !!tx.outputs,
            hasData: !!tx.data,
            dataLength: tx.data?.length,
            rawTxKeys: Object.keys(tx),
            firstDataItems: tx.data?.slice(0, 3)
        });

        // Process all transactions
        try {
            await this.parser.parseTransaction(txid);
        } catch (error) {
            // Check if this is a prepared statement error
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('prepared statement') || errorMessage.includes('P2010')) {
                logger.warn('⚠️ Prepared statement error, will retry later', {
                    txid,
                    block,
                    error: errorMessage
                });
                
                // For target txids, retry with a delay
                setTimeout(async () => {
                    try {
                        logger.info('🔄 Retrying target transaction', { txid });
                        await this.parser.parseTransaction(txid);
                        logger.info('✅ Successfully processed target transaction on retry', { txid });
                    } catch (retryError) {
                        logger.error('❌ Failed to process target transaction on retry', {
                            txid,
                            error: retryError instanceof Error ? retryError.message : 'Unknown error'
                        });
                    }
                }, 30000); // Retry after 30 seconds
            } else {
                logger.error('❌ Error processing transaction', {
                    txid,
                    block,
                    error: errorMessage
                });
            }
        }
    }

    private async handleStatus(status: any): Promise<void> {
        // Only log block completion and waiting status
        if (status.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info("⏳ Waiting for new blocks", { currentBlock: status.block });
        } else if (status.statusCode === 199) {
            logger.info("✓ Block scanned", { block: status.block });
        }
    }

    private handleError(error: any): void {
        logger.error("❌ SUBSCRIPTION ERROR", error);
    }

    private async fetchSubscriptionDetails() {
        try {
            const response = await fetch(`${this.jungleBus.url}/v1/subscription/${this.subscriptionId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            logger.info("📋 SUBSCRIPTIO N DETAILS", { data });
            return data;
        } catch (error) {
            logger.warn("⚠️ Failed to fetch subscription details", {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscriptionId: this.subscriptionId
            });
            return null;
        }
    }

    public async start(): Promise<void> {
        try {
            logger.info(`🚀 Starting scanner from block ${this.startBlock} with subscription ID ${this.subscriptionId}`);
            
            // Use the direct parameter approach instead of an object
            await this.jungleBus.Subscribe(
                this.subscriptionId,
                this.startBlock,
                (tx: any) => this.handleTransaction(tx),
                (status: any) => this.handleStatus(status),
                (error: any) => this.handleError(error)
            );
            
            logger.info(`✅ Scanner subscription ${this.subscriptionId} started successfully`);
        } catch (error) {
            logger.error(`❌ Failed to start scanner`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscriptionId: this.subscriptionId,
                startBlock: this.startBlock
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