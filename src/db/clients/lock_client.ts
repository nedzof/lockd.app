/**
 * Lock Database Client
 * 
 * Handles database operations for lock-related entities.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import BaseDbClient from './base_client.js';

interface LockLike {
  tx_id: string;
  post_id: string;
  author_address?: string;
  amount?: number;
  created_at: Date;
  unlock_height?: number;
  vote_option_id?: string;
}

export class LockClient extends BaseDbClient {
  constructor() {
    super();
  }
  
  /**
   * Create a new lock like
   * @param lockLike The lock like to create
   * @returns The created lock like
   */
  async create_lock_like(lockLike: LockLike): Promise<any> {
    try {
      return await this.with_retry(() => 
        this.prisma.lock_like.create({
          data: {
            tx_id: lockLike.tx_id,
            post_id: lockLike.post_id,
            author_address: lockLike.author_address,
            amount: lockLike.amount || 0,
            created_at: lockLike.created_at,
            unlock_height: lockLike.unlock_height,
            vote_option_id: lockLike.vote_option_id
          }
        })
      );
    } catch (error) {
      this.log_error('Error creating lock like', error as Error, {
        tx_id: lockLike.tx_id,
        post_id: lockLike.post_id
      });
      throw error;
    }
  }
  
  /**
   * Get a lock like by transaction ID
   * @param transactionId The transaction ID of the lock like
   * @returns The lock like or null if not found
   */
  async get_lock_like_by_transaction_id(transactionId: string): Promise<any | null> {
    try {
      return await this.with_retry(() => 
        this.prisma.lock_like.findUnique({
          where: {
            tx_id: transactionId
          }
        })
      );
    } catch (error) {
      this.log_error('Error getting lock like by transaction ID', error as Error, {
        tx_id: transactionId
      });
      return null;
    }
  }
  
  /**
   * Get lock likes for a post
   * @param postId The ID of the post
   * @returns The lock likes for the post
   */
  async get_lock_likes_for_post(postId: string): Promise<any[]> {
    try {
      return await this.with_retry(() => 
        this.prisma.lock_like.findMany({
          where: {
            post_id: postId
          }
        })
      );
    } catch (error) {
      this.log_error('Error getting lock likes for post', error as Error, {
        post_id: postId
      });
      return [];
    }
  }
  
  /**
   * Count lock likes for a post
   * @param postId The ID of the post
   * @returns The number of lock likes for the post
   */
  async count_lock_likes_for_post(postId: string): Promise<number> {
    try {
      return await this.with_retry(() => 
        this.prisma.lock_like.count({
          where: {
            post_id: postId
          }
        })
      );
    } catch (error) {
      this.log_error('Error counting lock likes for post', error as Error, {
        post_id: postId
      });
      return 0;
    }
  }
  
  /**
   * Delete a lock like by transaction ID
   * @param transactionId The transaction ID of the lock like to delete
   * @returns True if the lock like was deleted
   */
  async delete_lock_like(transactionId: string): Promise<boolean> {
    try {
      await this.with_retry(() => 
        this.prisma.lock_like.delete({
          where: {
            tx_id: transactionId
          }
        })
      );
      
      return true;
    } catch (error) {
      this.log_error('Error deleting lock like', error as Error, {
        tx_id: transactionId
      });
      return false;
    }
  }
  
  /**
   * Delete all lock likes
   * @returns The number of deleted lock likes
   */
  async delete_all_lock_likes(): Promise<number> {
    try {
      const result = await this.with_retry(() => 
        this.prisma.lock_like.deleteMany({})  
      );
      
      this.log_info('Deleted all lock likes', {
        count: result.count
      });
      
      return result.count;
    } catch (error) {
      this.log_error('Error deleting all lock likes', error as Error);
      throw error;
    }
  }
}

// Export singleton instance
export const lock_client = new LockClient();

// Export default for direct instantiation
export default LockClient;
