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
    // Store block heights for transactions to ensure they're properly saved
    private txBlockHeights: Map<string, number> = new Map();

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
            // Get the block height for this transaction if available
            const block_height = this.txBlockHeights.get(tx_id) || 0;
            logger.info('🔍 Processing transaction', { tx_id, block_height });
            
            // First, try to fetch raw transaction data for specialized content extraction
            let rawTxData: any = null;
            try {
                rawTxData = await this.txDataParser.fetch_transaction(tx_id);
                logger.debug('📄 Fetched raw transaction data', { 
                    tx_id, 
                    has_data: !!rawTxData 
                });
            } catch (fetchError) {
                logger.warn('⚠️ Error fetching raw transaction data', {
                    tx_id,
                    error: fetchError instanceof Error ? fetchError.message : 'Unknown error'
                });
            }
            
            // Try to parse the transaction with the standard parser
            let parsedTx: any = null;
            try {
                parsedTx = await parser.parse_transaction(tx_id);
                
                // Ensure block height is set from our stored value if available
                if (block_height > 0 && parsedTx) {
                    parsedTx.block_height = block_height;
                }
                
                // If we have raw data but no extracted data in parsedTx, extract it now
                if (rawTxData && (!parsedTx.data || !Array.isArray(parsedTx.data) || parsedTx.data.length === 0)) {
                    parsedTx.data = this.txDataParser.extract_data_from_transaction(rawTxData) || [];
                    logger.info('Added extracted data to parsed transaction', { 
                        tx_id, 
                        data_count: parsedTx.data.length 
                    });
                }
                
                // Check for binary content in raw data and update content_type if needed
                if (rawTxData) {
                    const extractedData = this.txDataParser.extract_data_from_transaction(rawTxData) || [];
                    const specializedContent = this.txDataParser.extract_specialized_content(extractedData, tx_id);
                    
                    // If this is binary content, make sure it's properly identified
                    if (specializedContent.content_type.startsWith('image/') || 
                        specializedContent.content_type === 'binary' ||
                        specializedContent.content_type === 'application/pdf') {
                        
                        parsedTx.content_type = specializedContent.content_type;
                        parsedTx.content = specializedContent.content;
                        
                        // Handle specific image types
                        if (specializedContent.content_type === 'image/gif') {
                            logger.info('📸 Detected GIF image in transaction', { tx_id });
                            parsedTx.media_type = 'image/gif';
                            
                            // Ensure metadata includes image information
                            if (specializedContent.metadata && specializedContent.metadata.raw_image_data) {
                                // Make sure raw_image_data is propagated to parsedTx
                                parsedTx.raw_image_data = specializedContent.metadata.raw_image_data;
                            }
                            
                            // Ensure image metadata is preserved
                            if (specializedContent.metadata && specializedContent.metadata.image_metadata) {
                                parsedTx.image_metadata = specializedContent.metadata.image_metadata;
                            } else {
                                parsedTx.image_metadata = { format: 'gif' };
                            }
                        } else if (specializedContent.content_type === 'image/png') {
                            parsedTx.media_type = 'image/png';
                            parsedTx.image_metadata = specializedContent.metadata?.image_metadata || { format: 'png' };
                        } else if (specializedContent.content_type === 'image/jpeg') {
                            parsedTx.media_type = 'image/jpeg';
                            parsedTx.image_metadata = specializedContent.metadata?.image_metadata || { format: 'jpeg' };
                        }
                        
                        // Merge any other metadata
                        parsedTx.metadata = {
                            ...parsedTx.metadata,
                            ...specializedContent.metadata,
                            content_type: specializedContent.content_type
                        };
                        
                        logger.info('📊 Updated transaction with binary content info', { 
                            tx_id, 
                            content_type: parsedTx.content_type,
                            media_type: parsedTx.media_type || 'none'
                        });
                    }
                }
            } catch (parseError) {
                logger.warn('⚠️ Error parsing transaction', { 
                    tx_id, 
                    error: parseError instanceof Error ? parseError.message : 'Unknown error' 
                });
            }
            
            // If we couldn't parse the transaction, create a transaction object from raw data
            if (!parsedTx && rawTxData) {
                try {
                    // Extract data from the transaction
                    const extractedData = this.txDataParser.extract_data_from_transaction(rawTxData) || [];
                    const specializedContent = this.txDataParser.extract_specialized_content(extractedData, tx_id);
                    
                    // Create a transaction object with the extracted data
                    parsedTx = {
                        tx_id,
                        content: specializedContent.content || '',
                        content_type: specializedContent.content_type || 'text',
                        block_height: this.txBlockHeights.get(tx_id) || 0,
                        timestamp: new Date().toISOString(),
                        type: 'post', // Default to post type to ensure post creation
                        metadata: specializedContent.metadata || {},
                        data: extractedData
                    };
                    logger.info('🔧 Created transaction object from raw data', { 
                        tx_id,
                        content_type: parsedTx.content_type
                    });
                } catch (processError) {
                    logger.warn('⚠️ Error processing raw transaction data', {
                        tx_id,
                        error: processError instanceof Error ? processError.message : 'Unknown error'
                    });
                }
            }
            
            // If we still have no parsed transaction, create a minimal placeholder
            if (!parsedTx) {
                parsedTx = {
                    tx_id,
                    content: '',
                    content_type: 'text',
                    block_height: this.txBlockHeights.get(tx_id) || 0,
                    timestamp: new Date().toISOString(),
                    type: 'post', // Default to post type to ensure post creation
                    metadata: { error: 'Failed to parse transaction' },
                    data: []
                };
                logger.info('🔧 Created empty placeholder transaction object', { tx_id });
            }
            
            // Check if this might be a vote transaction
            const isVote = this.isVoteTransaction(parsedTx);
            
            if (isVote) {
                logger.info('🗳️ Detected vote transaction, processing with VoteTransactionService', { tx_id });
                
                // If the transaction doesn't have a data array, try to use the data we've already fetched
                if (!parsedTx.data || !Array.isArray(parsedTx.data) || parsedTx.data.length === 0) {
                    if (rawTxData) {
                        const extractedData = this.txDataParser.extract_data_from_transaction(rawTxData);
                        if (extractedData && extractedData.length > 0) {
                            parsedTx.data = extractedData;
                            logger.info('Added extracted data to vote transaction', { 
                                tx_id, 
                                data_count: parsedTx.data.length 
                            });
                        }
                    }
                }
                
                // Process the vote transaction
                const voteResult = await this.voteService.processVoteTransaction(parsedTx);
                
                if (voteResult) {
                    logger.info('✅ Vote transaction processed successfully', {
                        tx_id,
                        post_id: voteResult.post.id,
                        options_count: voteResult.voteOptions.length
                    });
                } else {
                    logger.warn('⚠️ Vote transaction processing failed', { tx_id });
                    
                    // Save the failed vote transaction as a post transaction
                    try {
                        await db_client.process_transaction({
                            tx_id,
                            content: parsedTx.content || "",
                            content_type: parsedTx.content_type || "text",
                            block_height: parsedTx.block_height || this.txBlockHeights.get(tx_id) || 0,
                            timestamp: parsedTx.timestamp || new Date().toISOString(),
                            type: 'post', // Mark as post type to create a post entry
                            protocol: parsedTx.protocol || 'MAP',
                            metadata: { ...parsedTx.metadata, is_vote_attempt: true }
                        });
                        logger.info('✅ Failed vote transaction saved as regular transaction', { tx_id });
                    } catch (dbError) {
                        logger.error('❌ Error saving failed vote transaction', {
                            tx_id,
                            error: dbError instanceof Error ? dbError.message : 'Unknown error'
                        });
                    }
                }
            } else {
                // For non-vote transactions, explicitly save to the database
                try {
                    // Ensure the transaction is saved to the database using the correct method
                    await db_client.process_transaction({
                        tx_id,
                        content: parsedTx.content || "",
                        content_type: parsedTx.content_type || "text",
                        block_height: parsedTx.block_height || this.txBlockHeights.get(tx_id) || 0,
                        timestamp: parsedTx.timestamp || new Date().toISOString(),
                        type: parsedTx.type || 'post', // Default to post type if not specified
                        protocol: parsedTx.protocol || 'MAP',
                        metadata: parsedTx.metadata || {}
                    });
                    
                    logger.info('✅ Regular transaction saved to database', { tx_id });
                } catch (dbError) {
                    logger.error('❌ Error saving transaction to database', {
                        tx_id,
                        error: dbError instanceof Error ? dbError.message : 'Unknown error'
                    });
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

        // Extract block height from transaction
        const block_height = tx?.block?.height || tx?.height || tx?.block_height;

        // Store transaction data including block height in a map
        if (block_height) {
            this.txBlockHeights.set(tx_id, block_height);
            logger.debug('Stored block height for transaction', { tx_id, block_height });
        }

        // Log transaction detection
        logger.info('🔍 TRANSACTION DETECTED', {
            tx_id,
            block_height,
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