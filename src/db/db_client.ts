/**
 * Main Database Client
 * 
 * Coordinates between specialized database clients and provides a unified interface.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { createLogger, format, transports, Logger } from 'winston';
import { connect, disconnect } from './connection.js';
import { transaction_client } from './clients/transaction_client.js';
import { post_client } from './clients/post_client.js';
import { lock_client } from './clients/lock_client.js';

export class DbClient {
  private logger: Logger;
  
  // Specialized clients
  public transaction: typeof transaction_client;
  public post: typeof post_client;
  public lock: typeof lock_client;
  
  constructor() {
    // Initialize logger
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
    
    // Initialize specialized clients
    this.transaction = transaction_client;
    this.post = post_client;
    this.lock = lock_client;
  }
  
  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to database');
      await connect();
    } catch (error) {
      this.logger.error('Error connecting to database', {
        error: (error as Error).message
      });
      throw error;
    }
  }
  
  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    try {
      this.logger.info('Disconnecting from database');
      await disconnect();
    } catch (error) {
      this.logger.error('Error disconnecting from database', {
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Get the latest processed block height
   * @returns The latest block height or 0 if no transactions have been processed
   */
  async get_latest_block_height(): Promise<number> {
    return await this.transaction.get_latest_block_height();
  }
  
  /**
   * Check if a transaction has been processed
   * @param transactionId The transaction ID to check
   * @returns True if the transaction has been processed
   */
  async is_transaction_processed(transactionId: string): Promise<boolean> {
    return await this.transaction.is_transaction_processed(transactionId);
  }
  
  /**
   * Save a processed transaction
   * @param transaction The transaction to save
   * @returns The saved transaction
   */
  async save_processed_transaction(transaction: any): Promise<any> {
    return await this.transaction.save_processed_transaction(transaction);
  }
  
  /**
   * Create a new post
   * @param post The post to create
   * @returns The created post
   */
  async create_post(post: any): Promise<any> {
    return await this.post.create_post(post);
  }
  
  /**
   * Add vote options to a post
   * @param postId The ID of the post
   * @param voteOptions The vote options to add
   * @returns The created vote options
   */
  async add_vote_options(postId: string, voteOptions: any[]): Promise<any[]> {
    return await this.post.add_vote_options(postId, voteOptions);
  }
  
  /**
   * Create a new lock like
   * @param lockLike The lock like to create
   * @returns The created lock like
   */
  async create_lock_like(lockLike: any): Promise<any> {
    return await this.lock.create_lock_like(lockLike);
  }
  
  /**
   * Clean up the database by deleting all records
   * @returns Object with counts of deleted records from each table
   */
  async cleanup_database(): Promise<{ transactions: number; lock_likes: number; vote_options: number; posts: number }> {
    this.logger.info('Starting database cleanup');
    
    try {
      // Delete in proper order to respect foreign key constraints
      // First delete lock_likes (they reference posts and vote_options)
      const deletedLockLikes = await this.lock.delete_all_lock_likes();
      
      // Then delete vote_options (they reference posts)
      const deletedVoteOptions = await this.post.delete_all_vote_options();
      
      // Then delete posts
      const deletedPosts = await this.post.delete_all_posts();
      
      // Finally delete processed transactions
      const deletedTransactions = await this.transaction.delete_all_processed_transactions();
      
      // Log cleanup results
      this.logger.info('Database cleanup completed', {
        deleted_lock_likes: deletedLockLikes,
        deleted_vote_options: deletedVoteOptions,
        deleted_posts: deletedPosts,
        deleted_transactions: deletedTransactions
      });
      
      return {
        lock_likes: deletedLockLikes,
        vote_options: deletedVoteOptions,
        posts: deletedPosts,
        transactions: deletedTransactions
      };
    } catch (error) {
      this.logger.error('Error during database cleanup', {
        error: (error as Error).message
      });
      throw error;
    }
  }
}

// Export singleton instance
export const db_client = new DbClient();

// Export default for direct instantiation
export default DbClient;
