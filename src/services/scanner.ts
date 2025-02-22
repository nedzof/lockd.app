import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { TransactionParser } from "./parser";
import { DbClient } from "./dbClient";
import { CONFIG } from "./config";
import { logger } from "../utils/logger";

export class Scanner {
    private readonly START_BLOCK = 883800;  // Start earlier to catch all target blocks
    private readonly SUBSCRIPTION_ID = CONFIG.JB_SUBSCRIPTION_ID;
    private readonly jungleBus: JungleBusClient;
    private readonly parser: TransactionParser;

    constructor(parser: TransactionParser, dbClient: DbClient) {
        this.parser = parser;
        this.jungleBus = new JungleBusClient("https://junglebus.gorillapool.io", {
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

        const targetTxids = [
            "0861619cb8357753cb415832777d9a1bb42701047bb233cbdd5a9318c8328fea",
            "3f440827985052004a2d9db778445591f8fb09e3a60e661e8cbe8e6d2798bd84",
            "355b4989bb76ac9dc1d72b07861d3fa1e58b2f0bddb588ddaa4897226c132df4"
        ];

        const block = tx?.block?.height || tx?.height || tx?.blockHeight;

        if (targetTxids.includes(txid)) {
            logger.info("🎯 TARGET TRANSACTION FOUND", {
                txid,
                block
            });
        }

        try {
            await this.parser.parseTransaction(txid);
        } catch (error) {
            logger.error('❌ Error processing transaction', {
                txid,
                block,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
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
            const response = await fetch(`https://junglebus.gorillapool.io/v1/subscription/${this.SUBSCRIPTION_ID}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            logger.info("📋 SUBSCRIPTION DETAILS", { data });
            return data;
        } catch (error) {
            logger.warn("⚠️ Failed to fetch subscription details", {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscriptionId: this.SUBSCRIPTION_ID
            });
            return null;
        }
    }

    public async start(): Promise<void> {
        try {
            logger.info('🚀 STARTING SCANNER', {
                startBlock: this.START_BLOCK,
                subscriptionId: this.SUBSCRIPTION_ID,
                targetBlocks: [883850, 883975, 884239]
            });

            const boundHandleTransaction = this.handleTransaction.bind(this);
            const boundHandleStatus = this.handleStatus.bind(this);
            const boundHandleError = this.handleError.bind(this);

            logger.info('🔌 SUBSCRIBING TO JUNGLEBUS', {
                handlers: {
                    transaction: !!boundHandleTransaction,
                    status: !!boundHandleStatus,
                    error: !!boundHandleError
                }
            });

            // Get subscription details
            await this.fetchSubscriptionDetails();

            await this.jungleBus.Subscribe(
                this.SUBSCRIPTION_ID,
                this.START_BLOCK,
                boundHandleTransaction,
                boundHandleStatus,
                boundHandleError,
                boundHandleTransaction
            );
            
            logger.info('✅ SCANNER STARTED');
        } catch (error) {
            logger.error('❌ Failed to start scanner', {
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