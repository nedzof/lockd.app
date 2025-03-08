/**
 * Transaction Database Client
 * 
 * Handles database operations for processed transactions.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import BaseDbClient from './base_client.js';

interface ProcessedTransaction {
  tx_id: string;
  block_height: number;
  block_time: number;
  type?: string;
  protocol?: string;
  metadata: any;
  created_at?: Date;
  updated_at?: Date;
}

export class TransactionClient extends BaseDbClient {
  constructor() {
    super();
  }
  
  /**
   * Check if a transaction has been processed
   * @param transactionId The transaction ID to check
   * @returns True if the transaction exists in the database
   */
  async is_transaction_processed(transactionId: string): Promise<boolean> {
    try {
      const count = await this.with_retry(() => 
        this.prisma.processed_transaction.count({
          where: {
            tx_id: transactionId
          }
        })
      );
      
      return count > 0;
    } catch (error) {
      this.log_error('Error checking if transaction is processed', error as Error, {
        tx_id: transactionId
      });
      return false;
    }
  }
  
  /**
   * Get a processed transaction from the database
   * @param transactionId The transaction ID to retrieve
   * @returns The processed transaction or null if not found
   */
  async get_processed_transaction(transactionId: string): Promise<ProcessedTransaction | null> {
    try {
      const transaction = await this.with_retry(() => 
        this.prisma.processed_transaction.findUnique({
          where: {
            tx_id: transactionId
          }
        })
      );
      
      if (!transaction) {
        return null;
      }
      
      // Log what we're retrieving for debugging
      this.log_info('Retrieved processed transaction', {
        tx_id: transactionId,
        type: transaction.type,
        metadata_keys: transaction.metadata ? Object.keys(transaction.metadata) : []
      });
      
      // Convert the transaction to the correct format
      const processedTransaction: ProcessedTransaction = {
        tx_id: transaction.tx_id,
        block_height: transaction.block_height,
        block_time: Number(transaction.block_time), // Convert BigInt to number
        type: transaction.type,
        protocol: transaction.protocol,
        metadata: transaction.metadata
      };
      
      return processedTransaction;
    } catch (error) {
      this.log_error('Error retrieving processed transaction', error as Error, {
        tx_id: transactionId
      });
      return null;
    }
  }
  
  /**
   * Save a processed transaction to the database
   * @param transaction The transaction to save
   * @returns The saved transaction
   */
  async save_processed_transaction(transaction: ProcessedTransaction): Promise<any> {
    try {
      const now = new Date();
      
      // Ensure block_height is a valid number and not zero if possible
      const block_height = transaction.block_height > 0 ? 
        transaction.block_height : 
        await this.get_latest_block_height_for_transaction(transaction.tx_id);
      
      // Ensure we have a valid type (never default to 'unknown')
      const type = transaction.type && transaction.type !== 'unknown' ? 
        transaction.type : 'post';
      
      // Ensure we have a valid protocol
      const protocol = transaction.protocol || 'lock';
      
      // Ensure metadata is an object and not null
      const baseMetadata = transaction.metadata || {};
      
      // Create a clean metadata structure following KISS principles
      // Only include essential fields and preserve the original structure where possible
      // Rather than adding success/error fields unless explicitly provided
      const enhancedMetadata = {
        // Preserve original transaction data (most important part)
        original_transaction: baseMetadata.original_transaction || null,
        
        // Use the new translated_data field name instead of parsed_data for consistency
        translated_data: baseMetadata.translated_data || baseMetadata.parsed_data || null,
        
        // Preserve any existing fields from the base metadata, except error/success unless explicitly provided
        ...Object.entries(baseMetadata)
          .filter(([key]) => key !== 'original_transaction' && key !== 'parsed_data' && key !== 'translated_data')
          .reduce((obj, [key, value]) => {
            // Only include error/success if explicitly provided
            if ((key === 'error' || key === 'success') && value === undefined) {
              return obj;
            }
            obj[key] = value;
            return obj;
          }, {} as Record<string, any>)
      };
      
      // Log what we're saving for debugging
      this.log_info('Saving processed transaction', {
        tx_id: transaction.tx_id,
        type,
        protocol,
        metadata_keys: Object.keys(enhancedMetadata)
      });
      
      // Log the full metadata for detailed debugging
      this.log_info('Full transaction metadata', {
        tx_id: transaction.tx_id,
        metadata: enhancedMetadata
      });
      
      return await this.with_retry(() => 
        this.prisma.processed_transaction.upsert({
          where: {
            tx_id: transaction.tx_id
          },
          update: {
            block_height: block_height,
            block_time: BigInt(transaction.block_time),
            type,
            protocol,
            metadata: enhancedMetadata,
            updated_at: now
          },
          create: {
            tx_id: transaction.tx_id,
            block_height: block_height,
            block_time: BigInt(transaction.block_time),
            type,
            protocol,
            metadata: enhancedMetadata,
            created_at: transaction.created_at || now,
            updated_at: transaction.updated_at || now
          }
        })
      );
    } catch (error) {
      this.log_error('Error saving processed transaction', error as Error, {
        tx_id: transaction.tx_id
      });
      throw error;
    }
  }
  
  /**
   * Get the latest block height for a transaction from related tables
   * @param transactionId The transaction ID to check
   * @returns The block height if found, otherwise 0
   */
  private async get_latest_block_height_for_transaction(transactionId: string): Promise<number> {
    try {
      // Check if this transaction is associated with a post
      const post = await this.with_retry(() =>
        this.prisma.post.findFirst({
          where: {
            tx_id: transactionId
          }
        })
      );
      
      if (post?.block_height) {
        return post.block_height;
      }
      
      // Check if this transaction is associated with a lock_like
      const lockLike = await this.with_retry(() =>
        this.prisma.lock_like.findFirst({
          where: {
            tx_id: transactionId
          }
        })
      );
      
      if (lockLike?.unlock_height) {
        return lockLike.unlock_height;
      }
      
      return 0;
    } catch (error) {
      this.log_error('Error getting block height for transaction', error as Error, {
        tx_id: transactionId
      });
      return 0;
    }
  }
  
  // The get_processed_transaction function has been moved to line ~55
  
  /**
   * Get the latest processed block height
   * @returns The latest block height or 0 if no transactions have been processed
   */
  async get_latest_block_height(): Promise<number> {
    try {
      const latestTransaction = await this.with_retry(() => 
        this.prisma.processed_transaction.findFirst({
          orderBy: {
            block_height: 'desc'
          }
        })
      );
      
      return latestTransaction?.block_height || 0;
    } catch (error) {
      this.log_error('Error getting latest block height', error as Error);
      return 0;
    }
  }
  
  /**
   * Delete all processed transactions
   * @returns The number of deleted transactions
   */
  async delete_all_processed_transactions(): Promise<number> {
    try {
      const result = await this.with_retry(() => 
        this.prisma.processed_transaction.deleteMany({})
      );
      
      this.log_info('Deleted all processed transactions', {
        count: result.count
      });
      
      return result.count;
    } catch (error) {
      this.log_error('Error deleting all processed transactions', error as Error);
      throw error;
    }
  }
}

// Export singleton instance
export const transaction_client = new TransactionClient();

// Export default for direct instantiation
export default TransactionClient;
