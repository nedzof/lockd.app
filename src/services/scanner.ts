import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { parser } from '../parser/index.js';
import { db_client } from '../db/index.js';
import { CONFIG } from './config.js';
import { logger } from '../utils/logger.js';

export class Scanner {
    private readonly start_block = 0;  // Start earlier to catch all target blocks
    private readonly jungle_bus: JungleBusClient;
    private pending_transactions: string[] = [];
    private processing_batch = false;
    private readonly batch_size = 5; // Process 5 transactions at a time
    private readonly batch_interval = 5000; // 5 seconds between batches

    constructor() {
        logger.info('Scanner initializing with new parser and db_client');
        this.jungle_bus = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: 'json',
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

        // Start the batch processing loop
        this.processBatches();
    }

    private async processBatches() {
        while (true) {
            try {
                if (this.pending_transactions.length > 0 && !this.processing_batch) {
                    this.processing_batch = true;
                    
                    // Take a batch of transactions
                    const batch = this.pending_transactions.splice(0, this.batch_size);
                    
                    logger.info(`🔄 Processing batch of ${batch.length} transactions`, {
                        batch_size: batch.length,
                        remaining: this.pending_transactions.length
                    });
                    
                    // Process each transaction in the batch
                    const promises = batch.map(tx_id => {
                        return parser.parse_transaction(tx_id).catch(error => {
                            logger.error('❌ Error processing transaction in batch', {
                                tx_id,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        });
                    });
                    
                    // Wait for all transactions to be processed with a timeout
                    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 30000)); // 30 second timeout
                    await Promise.race([Promise.all(promises), timeoutPromise]);
                    
                    this.processing_batch = false;
                }
            } catch (error) {
                logger.error('❌ Error in batch processing loop', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                this.processing_batch = false;
            }
            
            // Wait before processing the next batch
            await new Promise(resolve => setTimeout(resolve, this.batch_interval));
        }
    }

    private async handleTransaction(tx: any): Promise<void> {
        // Try different ways to get the tx_id
        const tx_id = tx?.transaction?.hash || tx?.hash || tx?.id || tx?.tx_id;
        if (!tx_id) {
            return;
        }

        const block = tx?.block?.height || tx?.height || tx?.block_height;

        // Clear transaction detection log
        logger.info('🔍 TRANSACTION DETECTED', {
            tx_id,
            block,
            type: 'incoming'
        });

        // Add transaction to the pending list
        this.pending_transactions.push(tx_id);
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
        const subscription_id = process.env.JB_SUBSCRIPTION_ID || CONFIG.JB_SUBSCRIPTION_ID;
        try {
            // Direct API call to JungleBus
            const response = await fetch(`https://junglebus.gorillapool.io/v1/subscription/${subscription_id}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            logger.info("📋 SUBSCRIPTION DETAILS", { data });
            return data;
        } catch (error) {
            logger.warn("⚠️ Failed to fetch subscription details", {
                error: error instanceof Error ? error.message : 'Unknown error',
                subscription_id
            });
            return null;
        }
    }

    /**
     * Get the current block height from the database
     * @returns The current block height or null if not available
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        try {
            // Try to get the block height from the database
            const dbHeight = await db_client.get_current_block_height();
            if (dbHeight) {
                return dbHeight;
            }
            
            // If database call fails, use the default start block from config
            logger.info(`Using default start block from config: ${CONFIG.DEFAULT_START_BLOCK}`);
            return CONFIG.DEFAULT_START_BLOCK;
        } catch (error) {
            logger.error('Error getting current block height', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Return the default start block as a fallback
            logger.info(`Using default start block as fallback: ${CONFIG.DEFAULT_START_BLOCK}`);
            return CONFIG.DEFAULT_START_BLOCK;
        }
    }

    /**
     * Cleans up the database by removing all processed transactions and related data
     * @returns Promise<void>
     */
    public async cleanupDatabase(): Promise<void> {
        try {
            logger.info('Starting database cleanup');
            await db_client.cleanup_database();
            logger.info('Database cleanup completed successfully');
        } catch (error) {
            logger.error('Failed to clean up database', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    public async start(): Promise<void> {
        try {
            // Check if database cleanup is requested
            if (process.env.CLEANUP_DB === 'true') {
                logger.info('Database cleanup requested before scanning');
                await this.cleanupDatabase();
            }
            const subscription_id = process.env.JB_SUBSCRIPTION_ID || CONFIG.JB_SUBSCRIPTION_ID;
            logger.info(`🚀 Starting scanner from block ${this.start_block} with subscription ID ${subscription_id}`);
            
            // If start_block is 0, try to get the latest block height from the database
            let start_block = this.start_block;
            if (start_block === 0) {
                const latestBlockHeight = await this.getCurrentBlockHeight();
                if (latestBlockHeight) {
                    start_block = latestBlockHeight;
                    logger.info(`Using latest block height from database: ${start_block}`);
                } else {
                    // Default to a reasonable starting point if we can't get the latest height
                    start_block = CONFIG.DEFAULT_START_BLOCK;
                    logger.info(`Using default start block: ${start_block}`);
                }
            }
            
            try {
                // Define callback functions
                const onPublish = (tx: any) => {
                    this.handleTransaction(tx);
                };
                
                const onStatus = (message: any) => {
                    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                        logger.info("✓ Block scanned", { block: message.block });
                    } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
                        logger.info("⏳ Waiting for new blocks", { current_block: message.block });
                    } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                        logger.info("🔄 REORG TRIGGERED", message);
                    } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
                        logger.error("❌ JungleBus Status Error", message);
                    }
                };
                
                const onError = (err: any) => {
                    logger.error("❌ JungleBus Error", err);
                };
                
                const onMempool = (tx: any) => {
                    this.handleTransaction(tx);
                };
                
                // Subscribe to the JungleBus using the format from the example
                await this.jungle_bus.Subscribe(
                    subscription_id,
                    start_block,
                    onPublish,
                    onStatus,
                    onError,
                    onMempool
                );
                
                logger.info(`Scanner started successfully from block ${start_block}`);
            } catch (jungleBusError) {
                // Handle JungleBus connection errors gracefully
                logger.error('JungleBus connection error', {
                    error: jungleBusError instanceof Error ? jungleBusError.message : 'Unknown error',
                    subscription_id
                });
                
                logger.info('Scanner will continue to run without JungleBus connection');
                
                // Start a polling loop to check for new transactions periodically
                this.startPollingLoop();
            }
        } catch (error) {
            logger.error('Failed to start scanner', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
    
    /**
     * Start a polling loop to check for new transactions periodically
     * This is a fallback when JungleBus connection fails
     */
    private async startPollingLoop() {
        logger.info('Starting polling loop for transactions');
        
        // Poll every 30 seconds
        const POLL_INTERVAL = 30000;
        
        while (true) {
            try {
                logger.info('Polling for new transactions');
                
                // Wait for the next poll interval
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            } catch (error) {
                logger.error('Error in polling loop', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                
                // Wait before trying again
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            }
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
    const scanner = new Scanner();
    scanner.start().catch(console.error);
}