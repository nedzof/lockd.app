import { TransactionClient } from './clients/transaction_client.js';
import { PostClient } from './clients/post_client.js';
import { LockClient } from './clients/lock_client.js';
import { ParsedTransaction, LockLike, Post, ProcessedTransaction, VoteOption } from '../shared/types.js';
import { logger } from '../utils/logger.js';

/**
 * Main database client that orchestrates specialized clients
 */
export class DbClient {
    private static instance: DbClient;
    
    private transaction_client: TransactionClient;
    private post_client: PostClient;
    private lock_client: LockClient;
    
    private constructor() {
        this.transaction_client = new TransactionClient();
        this.post_client = new PostClient();
        this.lock_client = new LockClient();
        
        logger.info('DbClient initialized with specialized clients');
    }
    
    /**
     * Get the singleton instance of DbClient
     * @returns DbClient instance
     */
    public static get_instance(): DbClient {
        if (!DbClient.instance) {
            DbClient.instance = new DbClient();
        }
        return DbClient.instance;
    }
    
    /**
     * Process a transaction and save it to the database
     * Handles different transaction types and updates related tables
     * @param tx Parsed transaction to process
     * @returns Processed transaction
     */
    public async process_transaction(tx: ParsedTransaction): Promise<ProcessedTransaction | null> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            // Check for binary content
            const hasBinaryContent = this.detectBinaryContent(tx);
            
            logger.debug('Processing transaction', { 
                tx_id: tx.tx_id,
                type: tx.type,
                has_binary: hasBinaryContent
            });
            
            // First, save the transaction
            const saved_tx = await this.transaction_client.save_transaction(tx);
            
            // Depending on the transaction type, process additional data
            switch (tx.type) {
                case 'post':
                case 'repost':
                case 'reply':
                    // Handle post-related transactions
                    
                    // Make sure post_txid is set in metadata
                    if (!tx.metadata || typeof tx.metadata !== 'object') {
                        tx.metadata = {};
                    }
                    
                    // If post_txid is missing, use the transaction ID
                    if (!tx.metadata.post_txid) {
                        tx.metadata.post_txid = tx.tx_id;
                        logger.debug('Setting post_txid to tx_id', { tx_id: tx.tx_id });
                    }
                    
                    // Check for binary content and ensure proper metadata setup
                    if (hasBinaryContent) {
                        // Ensure metadata for binary content is properly set
                        if (tx.content_type) {
                            tx.metadata.content_type = tx.content_type;
                        }
                        
                        if (tx.media_type) {
                            tx.metadata.media_type = tx.media_type;
                        }
                        
                        if (tx.raw_image_data) {
                            tx.metadata.raw_image_data = tx.raw_image_data;
                        }
                        
                        if (tx.image_metadata) {
                            tx.metadata.image_metadata = tx.image_metadata;
                        }
                        
                        // Special handling for GIF images
                        if ((tx.content_type === 'image/gif' || tx.media_type === 'image/gif' || 
                             tx.metadata.content_type === 'image/gif' || tx.metadata.media_type === 'image/gif')) {
                            logger.info('🎬 Processing GIF image in transaction', { 
                                tx_id: tx.tx_id,
                                post_txid: tx.metadata.post_txid,
                                content_type: tx.content_type || tx.metadata.content_type
                            });
                        }
                    }
                    
                    // Create or update the post
                    const post = await this.post_client.create_or_update_post(tx);
                    logger.info('Created/updated post', { 
                        tx_id: tx.tx_id, 
                        post_id: post?.id,
                        success: post !== null,
                        has_binary: hasBinaryContent
                    });
                    
                    // Create vote options if this is a poll post
                    if (post && tx.metadata && 
                        typeof tx.metadata === 'object' && 
                        'vote_options' in tx.metadata && 
                        Array.isArray(tx.metadata.vote_options)) {
                        await this.post_client.create_vote_options(tx, post.tx_id);
                    }
                    break;
                
                case 'vote':
                    // Handle vote transactions with enhanced logging
                    logger.info('🗳️ Processing vote transaction', { 
                        tx_id: tx.tx_id,
                        content_length: tx.content?.length || 0,
                        has_content: !!tx.content,
                        has_metadata: !!tx.metadata
                    });
                    
                    // Ensure metadata is an object
                    if (!tx.metadata || typeof tx.metadata !== 'object') {
                        tx.metadata = {};
                    }
                    
                    // Check for vote options in metadata
                    const voteOptions = tx.metadata.vote_options || [];
                    const hasVoteOptions = Array.isArray(voteOptions) && voteOptions.length > 0;
                    
                    // Enhanced logging for vote options
                    logger.info('📊 Vote options detected', { 
                        tx_id: tx.tx_id,
                        has_options: hasVoteOptions,
                        options_count: hasVoteOptions ? voteOptions.length : 0,
                        options: hasVoteOptions ? voteOptions : null
                    });
                    
                    // Create the post with is_vote=true
                    const votePost = await this.post_client.create_or_update_post({
                        ...tx,
                        metadata: {
                            ...tx.metadata,
                            is_vote: true,
                            post_txid: tx.tx_id // Use the transaction ID as the post ID
                        }
                    });
                    
                    if (!votePost) {
                        logger.error('❌ Failed to create vote post', { tx_id: tx.tx_id });
                        break;
                    }
                    
                    logger.info('✅ Created vote post', { 
                        tx_id: tx.tx_id, 
                        post_id: votePost.id,
                        is_vote: votePost.is_vote
                    });
                    
                    // Create vote options - if no options exist, create default ones
                    if (!hasVoteOptions) {
                        // Create default Yes/No options if none provided
                        logger.info('⚠️ No vote options found, creating defaults', { tx_id: tx.tx_id });
                        tx.metadata.vote_options = ['Yes', 'No'];
                    }
                    
                    try {
                        const createdOptions = await this.post_client.create_vote_options(tx, votePost.tx_id);
                        logger.info('✅ Created vote options', { 
                            tx_id: tx.tx_id, 
                            post_id: votePost.id,
                            options_count: createdOptions.length,
                            options: createdOptions.map(opt => opt.content)
                        });
                    } catch (optionError) {
                        logger.error('❌ Failed to create vote options', { 
                            tx_id: tx.tx_id,
                            error: optionError instanceof Error ? optionError.message : 'Unknown error'
                        });
                    }
                    break;
                    
                case 'like':
                case 'unlike':
                    // Handle lock-related transactions
                    await this.lock_client.process_lock_action(tx);
                    break;
                
                case 'unknown':
                    // Try to process unknown as a post if content exists
                    if (tx.content) {
                        logger.info('Processing unknown transaction as post', { tx_id: tx.tx_id });
                        
                        // Ensure metadata is an object and set post_txid
                        if (!tx.metadata || typeof tx.metadata !== 'object') {
                            tx.metadata = {};
                        }
                        
                        if (!tx.metadata.post_txid) {
                            tx.metadata.post_txid = tx.tx_id;
                        }
                        
                        // Treat as post
                        const unknownPost = await this.post_client.create_or_update_post({
                            ...tx,
                            type: 'post' // Override type to post
                        });
                        
                        logger.info('Processed unknown as post', { 
                            tx_id: tx.tx_id, 
                            post_id: unknownPost?.id,
                            success: unknownPost !== null
                        });
                    } else {
                        logger.debug('Unknown transaction type without content, no processing', {
                            tx_id: tx.tx_id,
                            type: tx.type
                        });
                    }
                    break;
                    
                default:
                    logger.debug('Unhandled transaction type, no additional processing', {
                        tx_id: tx.tx_id,
                        type: tx.type
                    });
                    break;
            }
            
            return saved_tx;
        } catch (error) {
            logger.error('Error processing transaction', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    
    /**
     * Process multiple transactions in a batch
     * @param txs Array of parsed transactions
     * @returns Array of processed transactions
     */
    public async process_transaction_batch(txs: ParsedTransaction[]): Promise<ProcessedTransaction[]> {
        if (!txs || !Array.isArray(txs) || txs.length === 0) {
            return [];
        }
        
        logger.info(`Processing batch of ${txs.length} transactions`);
        
        const results: ProcessedTransaction[] = [];
        
        for (const tx of txs) {
            try {
                const result = await this.process_transaction(tx);
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                logger.error('Error processing transaction in batch', {
                    tx_id: tx.tx_id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                // Continue processing other transactions
            }
        }
        
        logger.info(`Successfully processed ${results.length}/${txs.length} transactions in batch`);
        
        return results;
    }
    
    /**
     * Get a transaction by ID
     * @param tx_id Transaction ID
     * @returns Transaction or null if not found
     */
    public async get_transaction(tx_id: string): Promise<ProcessedTransaction | null> {
        return await this.transaction_client.get_transaction(tx_id);
    }
    
    /**
     * Get a post by ID
     * @param post_txid Post transaction ID
     * @param include_vote_options Whether to include vote options
     * @returns Post or null if not found
     */
    public async get_post(post_txid: string, include_vote_options = false): Promise<Post | null> {
        return await this.post_client.get_post(post_txid, include_vote_options);
    }
    
    /**
     * Get all lock actions for a target
     * @param target_txid Target transaction ID
     * @returns Array of lock actions
     */
    public async get_locks_for_target(target_txid: string): Promise<LockLike[]> {
        return await this.lock_client.get_locks_for_target(target_txid);
    }
    
    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async get_current_block_height(): Promise<number | null> {
        return await this.transaction_client.get_current_block_height();
    }
    
    /**
     * Check for posts in the database and log the results
     * @returns Promise<number> The number of posts found
     */
    public async check_posts(): Promise<number> {
        try {
            logger.info('Checking posts in the database...');
            
            // Use the post_client's with_fresh_client method to execute the operation
            const posts = await this.post_client.with_fresh_client(async (client) => {
                return await client.post.findMany();
            });
            
            logger.info(`Found ${posts.length} posts in the database`);
            
            // Log some details of the posts if available
            if (posts.length > 0) {
                for (let i = 0; i < Math.min(posts.length, 5); i++) {
                    const post = posts[i];
                    logger.info(`Post ${i+1}: ID=${post.id}, TX=${post.tx_id}, Content=${post.content?.substring(0, 50) || 'empty'}...`);
                }
            }
            
            return posts.length;
        } catch (error) {
            logger.error('Error checking posts', {
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }
    
    /**
     * Check for vote options in the database and log the results
     * @returns Promise<number> The number of vote options found
     */
    public async check_vote_options(): Promise<number> {
        try {
            logger.info('Checking vote options in the database...');
            
            // Use the transaction_client's with_fresh_client method to execute the operation
            const voteOptions = await this.transaction_client.with_fresh_client(async (client) => {
                return await client.vote_option.findMany();
            });
            
            logger.info(`Found ${voteOptions.length} vote options in the database`);
            
            // Log some details of the vote options if available
            if (voteOptions.length > 0) {
                for (let i = 0; i < Math.min(voteOptions.length, 5); i++) {
                    const option = voteOptions[i];
                    logger.info(`Option ${i+1}: ID=${option.id}, Post ID=${option.post_id}, Text=${option.option_text}`);
                }
            }
            
            return voteOptions.length;
        } catch (error) {
            logger.error('Error checking vote options', {
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }
    
    /**
     * Check for transactions with block heights in the database and log the results
     * @returns Promise<number> The number of transactions with valid block heights
     */
    public async check_transactions_with_block_heights(): Promise<number> {
        try {
            logger.info('Checking block heights in processed transactions...');
            
            // Use the transaction_client's with_fresh_client method to execute the operation
            const transactions = await this.transaction_client.with_fresh_client(async (client) => {
                return await client.transaction.findMany({
                    where: {
                        block_height: {
                            gt: 0
                        }
                    }
                });
            });
            
            logger.info(`Found ${transactions.length} transactions with valid block heights`);
            
            // Get block height distribution for analytics
            if (transactions.length > 0) {
                const blockHeightMap = new Map<number, number>();
                transactions.forEach(tx => {
                    const height = tx.block_height;
                    if (height) {
                        blockHeightMap.set(height, (blockHeightMap.get(height) || 0) + 1);
                    }
                });
                
                // Convert to array and sort for logging
                const blockStats = Array.from(blockHeightMap.entries())
                    .map(([block_height, tx_count]) => ({ block_height, tx_count }))
                    .sort((a, b) => b.block_height - a.block_height);
                
                logger.info('Block height distribution:', { stats: blockStats });
            }
            
            return transactions.length;
        } catch (error) {
            logger.error('Error checking transactions with block heights', {
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }
    
    /**
     * Cleans up the database by removing all processed transactions and related data
     * @returns Promise<void>
     */
    public async cleanup_database(): Promise<void> {
        try {
            logger.info('Starting database cleanup');
            
            // We need to clean up in the correct order to respect foreign key constraints
            // First, clean up lock_like entries
            logger.info('Cleaning up lock_like entries');
            await this.lock_client.cleanup();
            
            // Clean up vote options
            logger.info('Cleaning up vote options');
            await this.post_client.cleanup_vote_options();
            
            // Clean up posts
            logger.info('Cleaning up posts');
            await this.post_client.cleanup_posts();
            
            // Finally, clean up transactions
            logger.info('Cleaning up processed transactions');
            await this.transaction_client.cleanup();
            
            logger.info('Database cleanup completed successfully');
        } catch (error) {
            logger.error('Failed to clean up database', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
    
    /**
     * Detect if a transaction contains binary content
     * @param tx Transaction to check for binary content
     * @returns Boolean indicating if binary content was detected
     */
    private detectBinaryContent(tx: ParsedTransaction): boolean {
        // Check if transaction has content_type or media_type indicating binary content
        const hasBinaryContentType = (
            (tx.content_type && (
                tx.content_type.startsWith('image/') ||
                tx.content_type === 'application/pdf' ||
                tx.content_type === 'binary'
            )) ||
            (tx.media_type && tx.media_type.startsWith('image/'))
        );
        
        // Check metadata for binary content indicators
        const hasMetadataBinaryIndicators = (
            tx.metadata && typeof tx.metadata === 'object' && (
                (tx.metadata.content_type && (
                    tx.metadata.content_type.startsWith('image/') ||
                    tx.metadata.content_type === 'application/pdf' ||
                    tx.metadata.content_type === 'binary'
                )) ||
                (tx.metadata.media_type && tx.metadata.media_type.startsWith('image/')) ||
                tx.metadata.raw_image_data ||
                tx.metadata.image_metadata
            )
        );
        
        // Check specifically for GIF image data
        const hasGifContent = (
            (tx.content_type === 'image/gif') ||
            (tx.media_type === 'image/gif') ||
            (tx.metadata && tx.metadata.content_type === 'image/gif') ||
            (tx.metadata && tx.metadata.media_type === 'image/gif') ||
            (tx.raw_image_data && tx.raw_image_data.length > 0) ||
            (tx.metadata && tx.metadata.raw_image_data && tx.metadata.raw_image_data.length > 0)
        );
        
        // Check for hex-encoded content indicators in the actual content
        const hasHexEncodedContent = (
            tx.content && 
            typeof tx.content === 'string' && 
            tx.content.startsWith('hex:')
        );
        
        const isBinary = hasBinaryContentType || hasMetadataBinaryIndicators || hasGifContent || hasHexEncodedContent;
        
        if (isBinary) {
            logger.info('Detected binary content in transaction', {
                tx_id: tx.tx_id,
                content_type: tx.content_type || (tx.metadata && tx.metadata.content_type) || 'unknown',
                media_type: tx.media_type || (tx.metadata && tx.metadata.media_type) || 'unknown',
                has_raw_image_data: !!(tx.raw_image_data || (tx.metadata && tx.metadata.raw_image_data)),
                is_gif: hasGifContent
            });
        }
        
        return isBinary;
    }
}

// Create a singleton instance of the DbClient
const db_client = DbClient.get_instance();

// Export the singleton instance
export { db_client };
