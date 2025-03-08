/**
 * Transaction Data Parser
 * 
 * Core transaction parsing logic that coordinates between specialized services.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import BaseParser from './base_parser.js';
import { lock_protocol_parser, LockActionType } from './lock_protocol_parser.js';
import { transaction_client } from '../db/clients/transaction_client.js';
import { BinaryDataProcessor } from './utils/binary_data_processor.js';
import { TransactionCacheService } from './utils/transaction_cache_service.js';

interface Transaction {
  // Standard transaction properties
  id?: string;
  hash?: string;
  tx_id?: string;
  height?: number;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
  timestamp?: number;
  
  // JungleBus format
  block?: {
    height: number;
    hash: string;
    time: number;
  };
  tx?: {
    h: string;
  };
  out?: {
    i: number;
    e?: { a: string; v: number; };
    s2?: string;
  }[];
  in?: {
    i: number;
    e?: { h: string; i: number; };
  }[];
}

interface ParsedTransaction {
  transaction_id: string;
  block_height: number;
  block_hash: string;
  block_time: number;
  content_type?: string;
  data?: any;
  metadata?: Record<string, any>;
  error?: string;
}

export class TransactionDataParser extends BaseParser {
  private binaryDataProcessor: BinaryDataProcessor;
  private transactionCache: TransactionCacheService;
  
  constructor() {
    super();
    this.binaryDataProcessor = new BinaryDataProcessor();
    this.transactionCache = new TransactionCacheService();
  }

  /**
   * Parse a transaction and extract relevant data
   * @param transaction The transaction to parse
   * @returns The parsed transaction data
   */
  async parse_transaction(transaction: Transaction): Promise<ParsedTransaction> {
    try {
      // Get transaction ID safely from different possible formats
      const transactionId = transaction?.tx?.h || transaction?.hash || transaction?.id || transaction?.tx_id || '';
      
      if (!transactionId) {
        throw new Error('Transaction ID not found in transaction data');
      }
      
      // Check if transaction has already been processed
      if (await this.is_transaction_processed(transactionId)) {
        this.log_info('Transaction already processed, retrieving existing data', { transaction_id: transactionId });
        
        // Get the existing transaction data from the database
        const existingTransaction = await transaction_client.get_processed_transaction(transactionId);
        
        // Get block details safely
        const block_height = transaction?.block?.height || transaction?.height || transaction?.block_height || existingTransaction?.block_height || 0;
        const block_hash = transaction?.block?.hash || transaction?.block_hash || '';
        const block_time = transaction?.block?.time || transaction?.block_time || transaction?.timestamp || (existingTransaction?.block_time ? Number(existingTransaction.block_time) : 0);
        
        // Create a comprehensive response with existing data
        const response: ParsedTransaction = {
          transaction_id: transactionId,
          block_height: block_height,
          block_hash: block_hash,
          block_time: block_time,
          content_type: existingTransaction?.type || 'lock_protocol',
          metadata: {
            ...existingTransaction?.metadata || {},
            already_processed: true
          }
        };
        
        // If the existing transaction has a type, use it to determine content_type
        if (existingTransaction?.type) {
          if (existingTransaction.type === 'vote') {
            response.data = {
              action: 'post',
              is_vote: true,
              ...existingTransaction.metadata
            };
          } else if (existingTransaction.type === 'post') {
            response.data = {
              action: 'post',
              is_vote: false,
              ...existingTransaction.metadata
            };
          } else if (existingTransaction.type === 'like') {
            response.data = {
              action: 'like',
              ...existingTransaction.metadata
            };
          } else if (existingTransaction.type === 'comment') {
            response.data = {
              action: 'comment',
              ...existingTransaction.metadata
            };
          }
        }
        
        this.log_info('Retrieved existing transaction data', { 
          transaction_id: transactionId,
          type: existingTransaction?.type,
          metadata_keys: existingTransaction?.metadata ? Object.keys(existingTransaction.metadata) : []
        });
        
        return response;
      }
      
      this.log_info('Parsing transaction', { transaction_id: transactionId });
      
      // Get block details safely
      const block_height = transaction?.block?.height || transaction?.height || transaction?.block_height || 0;
      const block_hash = transaction?.block?.hash || transaction?.block_hash || '';
      const block_time = transaction?.block?.time || transaction?.block_time || transaction?.timestamp || 0;
      
      // Extract basic transaction data
      const parsedTransaction: ParsedTransaction = {
        transaction_id: transactionId,
        block_height: block_height,
        block_hash: block_hash,
        block_time: block_time
      };

      // Try to parse as Lock protocol transaction
      const lockData = await lock_protocol_parser.parse_lock_protocol(transaction);
      
      if (lockData) {
        // Set the content type to lock_protocol
        parsedTransaction.content_type = 'lock_protocol';
        
        // Store the complete lock data
        parsedTransaction.data = lockData;
        
        // Create a comprehensive metadata object
        parsedTransaction.metadata = { 
          action: lockData.action,
          content: lockData.content,
          post_id: lockData.post_id,
          author_address: lockData.author_address,
          is_vote: lockData.is_vote
        };
        
        // Include vote options if available
        if (lockData.vote_options && lockData.vote_options.length > 0) {
          parsedTransaction.metadata.vote_options = lockData.vote_options;
        }
        
        // Include any additional data from the raw_data
        if (lockData.raw_data) {
          parsedTransaction.metadata = {
            ...parsedTransaction.metadata,
            ...lockData.raw_data
          };
        }
        
        this.log_info('Processed Lock protocol transaction', { 
          tx_id: transactionId,
          action: lockData.action,
          is_vote: lockData.is_vote
        });
      } else {
        // If not a Lock protocol transaction, try to detect binary data
        const binaryData = this.binaryDataProcessor.process_transaction(transaction);
        
        if (binaryData) {
          parsedTransaction.content_type = binaryData.content_type;
          parsedTransaction.data = binaryData.data;
          parsedTransaction.metadata = binaryData.metadata;
        }
      }

      // Mark transaction as processed with the parsed data
      await this.mark_transaction_processed(transactionId, true, null, parsedTransaction);
      
      return parsedTransaction;
    } catch (error) {
      // Get transaction ID safely from different possible formats
      const tx_id = transaction?.tx?.h || transaction?.hash || transaction?.id || transaction?.tx_id || 'unknown';
      
      this.log_error('Failed to parse transaction', error as Error, { transaction_id: tx_id });
      
      // Get block details safely with default values to satisfy TypeScript
      const block_height = transaction?.block?.height || transaction?.height || transaction?.block_height || 0;
      const block_hash = transaction?.block?.hash || transaction?.block_hash || '';
      const block_time = transaction?.block?.time || transaction?.block_time || transaction?.timestamp || 0;
      
      // Create a partial parsed transaction with available data
      const partialParsedTransaction = {
        transaction_id: tx_id,
        block_height: block_height,
        block_hash: block_hash,
        block_time: block_time,
        error: (error as Error).message
      };
      
      // Mark transaction as processed with error and partial data
      await this.mark_transaction_processed(tx_id, false, (error as Error).message, partialParsedTransaction);
      
      return partialParsedTransaction;
    }
  }

  /**
   * Check if a transaction has already been processed
   * @param transactionId The transaction ID to check
   * @returns True if the transaction has been processed
   */
  async is_transaction_processed(transactionId: string): Promise<boolean> {
    // First check in-memory cache
    if (this.transactionCache.is_transaction_processed(transactionId)) {
      return true;
    }
    
    // Then check database
    const isProcessed = await transaction_client.is_transaction_processed(transactionId);
    
    // If processed, add to cache
    if (isProcessed) {
      this.transactionCache.mark_transaction_processed(transactionId);
    }
    
    return isProcessed;
  }

  /**
   * Mark a transaction as processed
   * @param transactionId The transaction ID to mark as processed
   * @param success Whether the processing was successful
   * @param error Optional error message if processing failed
   * @param parsedData Optional parsed data from the transaction
   */
  async mark_transaction_processed(
    transactionId: string, 
    success: boolean, 
    error: string | null = null,
    parsedData?: any
  ): Promise<void> {
    // Add to in-memory cache
    this.transactionCache.mark_transaction_processed(transactionId, success, error);
    
    // Get the current transaction data if available
    const transaction = await transaction_client.get_processed_transaction(transactionId);
    
    // Determine transaction type and protocol based on the parsed data
    // Default to 'post' instead of 'unknown' to ensure we always have a valid type
    let type = 'post';
    let protocol = 'lock';
    
    // Initialize metadata with success/error information
    let metadata: any = {
      success: success,
    };
    
    if (error) {
      metadata.error = error;
    }
    
    if (parsedData) {
      // Use the metadata directly from parsedTransaction if available
      if (parsedData.metadata) {
        metadata = {
          ...metadata,
          ...parsedData.metadata
        };
      }
      
      // Set transaction type based on content_type and data
      if (parsedData.content_type === 'lock_protocol' && parsedData.data) {
        // Set type based on the action type
        if (parsedData.data.action === LockActionType.POST) {
          // For posts, check if it's a vote post or regular post
          type = parsedData.data.is_vote ? 'vote' : 'post';
        } else if (parsedData.data.action === LockActionType.LIKE) {
          type = 'like';
        } else if (parsedData.data.action === LockActionType.VOTE) {
          type = 'vote';
        } else if (parsedData.data.action === LockActionType.COMMENT) {
          type = 'comment';
        }
        
        // Ensure we have all the important fields in metadata
        if (!metadata.action && parsedData.data.action) {
          metadata.action = parsedData.data.action;
        }
        if (!metadata.content && parsedData.data.content) {
          metadata.content = parsedData.data.content;
        }
        if (!metadata.post_id && parsedData.data.post_id) {
          metadata.post_id = parsedData.data.post_id;
        }
        if (!metadata.author_address && parsedData.data.author_address) {
          metadata.author_address = parsedData.data.author_address;
        }
        
        // Add vote options if available
        if (parsedData.data.vote_options && parsedData.data.vote_options.length > 0 && !metadata.vote_options) {
          metadata.vote_options = parsedData.data.vote_options;
        }
        
        // Log the transaction type and metadata for debugging
        this.log_info('Setting transaction type and metadata', {
          tx_id: transactionId,
          type,
          protocol,
          metadata_keys: Object.keys(metadata)
        });
      } else if (parsedData.content_type) {
        // For non-lock protocol transactions, use the content_type as the type
        type = parsedData.content_type;
        
        // Store any available data as metadata
        if (parsedData.data) {
          if (typeof parsedData.data === 'object') {
            // Merge data object with our metadata, preserving success/error
            metadata = { 
              ...metadata,
              ...parsedData.data
            };
          } else {
            // For primitive data, add it as a data property
            metadata.data = parsedData.data;
          }
        }
      }
    }
    
    // Save to database with improved fields
    await transaction_client.save_processed_transaction({
      tx_id: transactionId,
      block_height: transaction?.block_height || parsedData?.block_height || 0,
      block_time: transaction?.block_time ? Number(transaction.block_time) : 
                 parsedData?.block_time || Math.floor(Date.now() / 1000),
      type,
      protocol,
      metadata
    });
    
    this.log_info('Marked transaction as processed', { 
      tx_id: transactionId,
      type,
      protocol,
      success,
      error
    });
  }
}

// Export singleton instance
export const transaction_data_parser = new TransactionDataParser();

// Export default for inheritance
export default TransactionDataParser;
