import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { parser } from '../parser/index.js';
import { db_client } from '../db/index.js';
import { CONFIG } from './config.js';
import { logger } from '../utils/logger.js';
import { VoteTransactionService } from './vote-transaction-service.js';
import { PrismaClient } from '@prisma/client';
import { TransactionDataParser } from '../parser/transaction_data_parser.js';

export class Scanner {
    private readonly start_block = CONFIG.DEFAULT_START_BLOCK;  // Use the configured default start block
    private readonly jungle_bus: JungleBusClient;
    private pending_transactions: string[] = [];
    private processing_batch = false;
    private readonly batch_size = 5; // Process 5 transactions at a time
    private readonly batch_interval = 5000; // 5 seconds between batches
    private voteService: VoteTransactionService;
    private txDataParser: TransactionDataParser;
    private prisma: PrismaClient;
    private isPolling = false;

    constructor() {
        logger.info('🔧 Scanner initializing with new parser and db_client');
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

        // Initialize Prisma client and services
        this.prisma = new PrismaClient();
        this.voteService = new VoteTransactionService(this.prisma);
        this.txDataParser = new TransactionDataParser();

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
                        return this.processTransaction(tx_id).catch(error => {
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

    /**
     * Process a transaction by its ID
     * This handles both regular transactions and vote transactions
     * 
     * @param tx_id - The transaction ID to process
     */
    public async processTransaction(tx_id: string): Promise<void> {
        try {
            logger.info('🔍 Processing transaction', { tx_id });
            
            // First, try to parse the transaction with the standard parser
            const parsedTx = await parser.parse_transaction(tx_id);
            
            // If the transaction is successfully parsed, check if it's a vote transaction
            if (parsedTx) {
                // Check if this might be a vote transaction
                const isVote = this.isVoteTransaction(parsedTx);
                
                if (isVote) {
                    logger.info('🗳️ Detected vote transaction, processing with VoteTransactionService', { tx_id });
                    
                    // Fetch the full transaction data if needed
                    let fullTx = parsedTx;
                    
                    // If the transaction doesn't have a data array, try to fetch it
                    if (!fullTx.data || !Array.isArray(fullTx.data) || fullTx.data.length === 0) {
                        try {
                            // Try to fetch the transaction data
                            const txData = await this.txDataParser.fetch_transaction(tx_id);
                            
                            if (txData) {
                                // Extract data from the transaction
                                const data = this.txDataParser.extract_data_from_transaction(txData);
                                
                                if (data && data.length > 0) {
                                    fullTx.data = data;
                                }
                            }
                        } catch (fetchError) {
                            logger.warn('⚠️ Error fetching additional transaction data', {
                                tx_id,
                                error: fetchError instanceof Error ? fetchError.message : 'Unknown error'
                            });
                        }
                    }
                    
                    // Process the vote transaction
                    const voteResult = await this.voteService.processVoteTransaction(fullTx);
                    
                    if (voteResult) {
                        logger.info('✅ Vote transaction processed successfully', {
                            tx_id,
                            post_id: voteResult.post.id,
                            options_count: voteResult.voteOptions.length
                        });
                    } else {
                        logger.warn('⚠️ Vote transaction processing failed', { tx_id });
                    }
                }
            }
        } catch (error) {
            logger.error('❌ Error processing transaction', {
                tx_id,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    /**
     * Check if a transaction is a vote transaction
     * 
     * @param tx - The transaction to check
     * @returns True if this is a vote transaction
     */
    private isVoteTransaction(tx: any): boolean {
        // Check if the transaction has vote indicators
        if (!tx) return false;
        
        // Check if it's explicitly marked as a vote
        if (tx.type === 'vote' || 
            (tx.metadata && tx.metadata.is_vote === true)) {
            return true;
        }
        
        // Check the data array for vote indicators
        if (Array.isArray(tx.data)) {
            // Check for vote indicators in the data array
            return tx.data.some((item: any) => {
                if (typeof item === 'string') {
                    return item === 'is_vote=true' || 
                           item === 'vote=true' || 
                           item.includes('vote_question') || 
                           item.includes('vote_option');
                } else if (item && typeof item === 'object') {
                    return (item.key === 'vote' && item.value === 'true') || 
                           (item.key === 'is_vote' && item.value === 'true') ||
                           item.key === 'question' || 
                           item.key === 'vote_question' ||
                           item.key === 'option' || 
                           item.key === 'vote_option';
                }
                return false;
            });
        }
        
        return false;
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
            logger.info(`📊 Using default block: ${CONFIG.DEFAULT_START_BLOCK}`);
            return CONFIG.DEFAULT_START_BLOCK;
        } catch (error) {
            logger.error('❌ Error getting current block height', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Return the default start block as a fallback
            logger.info(`📊 Using default block as fallback: ${CONFIG.DEFAULT_START_BLOCK}`);
            return CONFIG.DEFAULT_START_BLOCK;
        }
    }

    /**
     * Cleans up the database by removing all processed transactions and related data
     * @returns Promise<void>
     */
    public async cleanupDatabase(): Promise<void> {
        try {
            logger.info('🧹 Starting database cleanup');
            await db_client.cleanup_database();
            logger.info('🎉 Database cleanup completed successfully');
        } catch (error) {
            logger.error('❌ Failed to clean up database', { 
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
                logger.info('🧹 Database cleanup requested');
                await this.cleanupDatabase();
            }
            const subscription_id = process.env.JB_SUBSCRIPTION_ID || CONFIG.JB_SUBSCRIPTION_ID;
            logger.info(`🚀 Starting scanner from block ${this.start_block}`);
            
            // Always use the configured start block
            let start_block = this.start_block;
            logger.info(`📊 Using block: ${start_block}`);
            
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
                
                logger.info(`🎉 Scanner started successfully from block ${start_block}`);
            } catch (jungleBusError) {
                // Handle JungleBus connection errors gracefully
                logger.error('❌ JungleBus connection error', {
                    error: jungleBusError instanceof Error ? jungleBusError.message : 'Unknown error',
                    subscription_id
                });
                
                logger.info('🔄 Scanner will continue to run without JungleBus connection');
                
                // Start a polling loop to check for new transactions periodically
                this.startPollingLoop();
            }
        } catch (error) {
            logger.error('❌ Failed to start scanner', {
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
        logger.info('🔄 Starting polling loop for transactions');
        
        // Poll every 30 seconds
        const POLL_INTERVAL = 30000;
        
        // Set a flag to control the polling loop
        this.isPolling = true;
        
        while (this.isPolling) {
            try {
                logger.info('🔄 Polling for new transactions');
                
                // Wait for the next poll interval
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            } catch (error) {
                logger.error('❌ Error in polling loop', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                
                // Wait before trying again
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            }
        }
        
        logger.info('🛑 Polling loop stopped');
    }

    public async stop(): Promise<void> {
        try {
            logger.info('🛑 STOPPING SCANNER');
            
            // Stop the polling loop
            this.isPolling = false;
            
            // Safely disconnect from JungleBus
            try {
                if (this.jungle_bus) {
                    await Promise.race([
                        this.jungle_bus.Disconnect(),
                        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
                    ]);
                }
            } catch (disconnectError) {
                logger.warn('⚠️ Error disconnecting from JungleBus', {
                    error: disconnectError instanceof Error ? disconnectError.message : 'Unknown error'
                });
            }
            
            // Close the Prisma client
            try {
                if (this.prisma) {
                    await this.prisma.$disconnect();
                }
            } catch (prismaError) {
                logger.warn('⚠️ Error disconnecting Prisma client', {
                    error: prismaError instanceof Error ? prismaError.message : 'Unknown error'
                });
            }
            
            logger.info('👋 SCANNER STOPPED');
        } catch (error) {
            logger.error('❌ Failed to stop scanner', {
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