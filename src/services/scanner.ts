import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { TransactionParser } from "./parser";
import { DbClient } from "./dbClient";
import { CONFIG } from "./config";
import { logger } from "../utils/logger";

export class Scanner {
    private readonly start_block = 885675;  // Start earlier to catch all target blocks
    private readonly subscription_id = CONFIG.JB_SUBSCRIPTION_ID;
    private readonly jungle_bus: JungleBusClient;
    private readonly parser: TransactionParser;

    constructor(parser: TransactionParser, dbClient: DbClient) {
        this.parser = parser;
        this.jungle_bus = new JungleBusClient("junglebus.gorillapool.io", {
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

        const block = tx?.block?.height || tx?.height || tx?.block_height;

        // Clear transaction detection log
        logger.info('🔍 TRANSACTION DETECTED', {
            txid,
            block,
            type: 'incoming'
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
                    block
                });
                
                // For target txids, retry with a delay
                setTimeout(async () => {
                    try {
                        logger.info('🔄 Retrying transaction', { txid });
                        await this.parser.parseTransaction(txid);
                        logger.info('✅ Successfully processed transaction on retry', { txid });
                    } catch (retryError) {
                        logger.error('❌ Failed to process transaction on retry', {
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
        if (status.status_code === ControlMessageStatusCode.WAITING) {
            logger.info("⏳ Waiting for new blocks", { current_block: status.block });
        } else if (status.status_code === 199) {
            logger.info("✓ Block scanned", { block: status.block });
        }
    }

    private handleError(error: any): void {
        logger.error("❌ SUBSCRIPTION ERROR", error);
    }

    private async fetchSubscriptionDetails() {
        try {
            const response = await fetch(`${this.jungle_bus.url}/v1/subscription/${this.subscription_id}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            logger.info("📋 SUBSCRIPTIO N DETAILS", { data });
            return data;
        } catch (error) {
            logger.warn("⚠️ Failed to fetch subscription details", {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscription_id: this.subscription_id
            });
            return null;
        }
    }

    public async start(): Promise<void> {
        try {
            logger.info(`🚀 Starting scanner from block ${this.start_block} with subscription ID ${this.subscription_id}`);
            
            // Use the direct parameter approach instead of an object
            await this.jungle_bus.Subscribe(
                this.subscription_id,
                this.start_block,
                (tx: any) => this.handleTransaction(tx),
                (status: any) => this.handleStatus(status),
                (error: any) => this.handleError(error)
            );
            
            logger.info(`✅ Scanner subscription ${this.subscription_id} started successfully`);
        } catch (error) {
            logger.error(`❌ Failed to start scanner`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscription_id: this.subscription_id,
                start_block: this.start_block
            });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            logger.info(' STOPPING SCANNER');
            await this.jungle_bus.Disconnect();
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