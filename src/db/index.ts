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
            logger.debug('Processing transaction', { 
                tx_id: tx.tx_id,
                type: tx.type 
            });
            
            // First, save the transaction
            const saved_tx = await this.transaction_client.save_transaction(tx);
            
            // Depending on the transaction type, process additional data
            switch (tx.type) {
                case 'post':
                case 'repost':
                case 'reply':
                    // Handle post-related transactions
                    const post = await this.post_client.create_or_update_post(tx);
                    
                    // Create vote options if this is a poll post
                    if (post && tx.metadata && 
                        typeof tx.metadata === 'object' && 
                        'vote_options' in tx.metadata && 
                        Array.isArray(tx.metadata.vote_options)) {
                        await this.post_client.create_vote_options(tx, post.tx_id);
                    }
                    break;
                
                case 'vote':
                    // Handle vote transactions
                    logger.info('Processing vote transaction', { tx_id: tx.tx_id });
                    
                    // Create the post with is_vote=true
                    const votePost = await this.post_client.create_or_update_post({
                        ...tx,
                        metadata: {
                            ...tx.metadata,
                            is_vote: true,
                            post_txid: tx.tx_id // Use the transaction ID as the post ID
                        }
                    });
                    
                    // Create vote options
                    if (votePost && tx.metadata && 
                        typeof tx.metadata === 'object' && 
                        'vote_options' in tx.metadata && 
                        Array.isArray(tx.metadata.vote_options)) {
                        await this.post_client.create_vote_options(tx, votePost.tx_id);
                        logger.info('Created vote options', { 
                            tx_id: tx.tx_id, 
                            options_count: tx.metadata.vote_options.length 
                        });
                    }
                    break;
                    
                case 'like':
                case 'unlike':
                    // Handle lock-related transactions
                    await this.lock_client.process_lock_action(tx);
                    break;
                    
                default:
                    logger.debug('Unknown transaction type, no additional processing', {
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
}

// Create a singleton instance of the DbClient
const db_client = DbClient.get_instance();

// Export the singleton instance
export { db_client };
