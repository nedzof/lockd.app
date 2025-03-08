/**
 * Blockchain Transaction Scanner
 * 
 * Scans the blockchain for transactions using JungleBus and processes them
 * using the transaction parser system.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { createLogger, format, transports, Logger } from 'winston';
import { transaction_data_parser } from '../parser/transaction_data_parser';
import { transaction_cache_service } from '../parser/utils/transaction_cache_service';
import { junglebus_service } from './junglebus_service';
import { CONFIG } from './config';
import { ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { db_client } from '../db/db_client';
import { transaction_client } from '../db/clients/transaction_client';
import { lock_protocol_parser } from '../parser/lock_protocol_parser';

interface ScannerConfig {
  startBlock?: number;
  batchSize?: number;
  logLevel?: string;
}

export class Scanner {
  private logger: Logger;
  private config: Required<ScannerConfig>;
  private isRunning: boolean = false;
  private subscriptionId: string | null = null;
  private txBlockHeights: Map<string, number> = new Map();
  
  constructor(config: ScannerConfig = {}) {
    // Set default configuration values
    this.config = {
      startBlock: config.startBlock || CONFIG.DEFAULT_START_BLOCK,
      batchSize: config.batchSize || CONFIG.TX_BATCH_SIZE,
      logLevel: config.logLevel || 'info'
    };
    
    // Initialize logger
    this.logger = createLogger({
      level: this.config.logLevel,
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
  }
  
  /**
   * Start scanning the blockchain for transactions
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Scanner is already running');
      return;
    }
    
    try {
      this.isRunning = true;
      this.logger.info('Starting blockchain scanner', { 
        start_block: this.config.startBlock 
      });
      
      // Subscribe to JungleBus for transaction notifications
      this.subscriptionId = await junglebus_service.subscribe(
        this.config.startBlock,
        this.handle_transaction.bind(this),
        this.handle_status.bind(this),
        this.handle_error.bind(this),
        this.handle_mempool_transaction.bind(this)
      );
      
      this.logger.info('Scanner started successfully', { 
        subscription_id: this.subscriptionId 
      });
    } catch (error) {
      this.isRunning = false;
      this.logger.error('Failed to start scanner', { 
        error: (error as Error).message 
      });
      throw error;
    }
  }
  
  /**
   * Stop scanning the blockchain
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Scanner is not running');
      return;
    }
    
    try {
      this.logger.info('Stopping blockchain scanner');
      
      // Unsubscribe from JungleBus
      await junglebus_service.unsubscribe();
      
      this.isRunning = false;
      this.subscriptionId = null;
      this.logger.info('Scanner stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop scanner', { 
        error: (error as Error).message 
      });
      throw error;
    }
  }
  
  /**
   * Get the current scanner status
   * @returns The scanner status
   */
  get_status(): { 
    isRunning: boolean; 
    subscriptionId: string | null;
    cacheStats: { total: number; successful: number; failed: number };
  } {
    return {
      isRunning: this.isRunning,
      subscriptionId: this.subscriptionId,
      cacheStats: transaction_cache_service.get_cache_stats()
    };
  }
  
  /**
   * Clean up the database by deleting all records and optionally reprocess transactions
   * @param options Optional parameters for cleanup behavior
   * @returns Object with counts of deleted records from each table
   */
  async cleanup_database(options: { reprocessTransactions?: boolean } = {}): Promise<{ transactions: number; lock_likes: number; vote_options: number; posts: number }> {
    try {
      const reprocessTransactions = options.reprocessTransactions !== undefined ? options.reprocessTransactions : true;
      
      this.logger.info('Starting database cleanup', {
        reprocess_transactions: reprocessTransactions
      });
      
      // Use the db_client to clean up the database
      const result = await db_client.cleanup_database();
      
      this.logger.info('Database cleanup completed', {
        deleted_lock_likes: result.lock_likes,
        deleted_vote_options: result.vote_options,
        deleted_posts: result.posts,
        deleted_transactions: result.transactions,
        total_deleted_records: result.lock_likes + result.vote_options + result.posts + result.transactions
      });
      
      // Reprocess transactions if requested (default behavior)
      if (reprocessTransactions) {
        this.logger.info('Starting transaction reprocessing...');
        const reprocessedCount = await this.reprocess_transactions();
        this.logger.info(`Reprocessed ${reprocessedCount} transactions with enhanced metadata`);
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to clean up database', { 
        error: (error as Error).message 
      });
      throw error;
    }
  }
  
  /**
   * Reprocess historical transactions to ensure they have correct metadata
   * This uses the enhanced lock_protocol_parser to extract and store proper metadata
   * @param options Optional parameters to control reprocessing behavior
   * @returns The number of transactions reprocessed
   */
  async reprocess_transactions(options: { 
    batchSize?: number; 
    maxTransactions?: number;
    startBlock?: number;
    endBlock?: number;
  } = {}): Promise<number> {
    try {
      // Set up configuration for reprocessing
      const batchSize = options.batchSize || 100;
      const maxTransactions = options.maxTransactions || 1000;
      const startBlock = options.startBlock || this.config.startBlock;
      const endBlock = options.endBlock;
      
      this.logger.info('Fetching historical transactions to reprocess', {
        start_block: startBlock,
        end_block: endBlock || 'latest',
        batch_size: batchSize,
        max_transactions: maxTransactions
      });
      
      // Track statistics for reporting
      let totalProcessed = 0;
      let successCount = 0;
      let errorCount = 0;
      let lockProtocolCount = 0;
      
      // Process transactions in batches for better memory management
      let currentOffset = 0;
      let hasMoreTransactions = true;
      
      while (hasMoreTransactions && totalProcessed < maxTransactions) {
        // Calculate how many transactions to fetch in this batch
        const transactionsToFetch = Math.min(batchSize, maxTransactions - totalProcessed);
        
        // Fetch a batch of historical transactions
        const transactions = await junglebus_service.get_historical_transactions(
          startBlock,
          endBlock,
          transactionsToFetch
        );
        
        // Check if we have more transactions to process
        if (!transactions || transactions.length === 0) {
          this.logger.info('No more historical transactions found');
          hasMoreTransactions = false;
          break;
        }
        
        this.logger.info(`Processing batch of ${transactions.length} transactions`, {
          batch: Math.floor(currentOffset / batchSize) + 1,
          transactions_in_batch: transactions.length
        });
        
        // Process transactions concurrently but with a reasonable limit
        const processingPromises = [];
        const batchResults: { success: boolean; txId: string; isLockProtocol?: boolean }[] = [];
        
        // Process each transaction in the batch
        for (const transaction of transactions) {
          // Extract transaction ID
          const txId = transaction?.tx?.h || transaction?.id || transaction?.hash;
          
          if (!txId) {
            this.logger.warn('Transaction missing ID, skipping', { transaction });
            batchResults.push({ success: false, txId: 'unknown' });
            continue;
          }
          
          // Create a processing promise for each transaction
          const processingPromise = (async () => {
            try {
              // Check if this is a Lock protocol transaction before processing
              const isLockProtocol = lock_protocol_parser.is_lock_protocol_transaction(transaction);
              
              // Process the transaction
              await this.handle_transaction(transaction);
              
              // Record success and whether it was a Lock protocol transaction
              batchResults.push({ 
                success: true, 
                txId, 
                isLockProtocol 
              });
              
              // Increment Lock protocol count if applicable
              if (isLockProtocol) {
                lockProtocolCount++;
              }
              
              return { success: true, txId };
            } catch (error) {
              this.logger.error('Error reprocessing transaction', {
                error: (error as Error).message,
                transaction_id: txId
              });
              
              batchResults.push({ success: false, txId });
              return { success: false, txId };
            }
          })();
          
          processingPromises.push(processingPromise);
        }
        
        // Wait for all transactions in this batch to be processed
        await Promise.allSettled(processingPromises);
        
        // Update statistics based on batch results
        for (const result of batchResults) {
          totalProcessed++;
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
        
        // Log progress after each batch
        this.logger.info('Batch processing complete', {
          batch: Math.floor(currentOffset / batchSize) + 1,
          successful_in_batch: batchResults.filter(r => r.success).length,
          errors_in_batch: batchResults.filter(r => !r.success).length,
          lock_protocol_in_batch: batchResults.filter(r => r.isLockProtocol).length,
          total_processed_so_far: totalProcessed,
          total_successful_so_far: successCount,
          total_errors_so_far: errorCount,
          total_lock_protocol_so_far: lockProtocolCount
        });
        
        // Prepare for next batch
        currentOffset += transactions.length;
      }
      
      // Log final results
      this.logger.info('Transaction reprocessing complete', {
        total_processed: totalProcessed,
        successful: successCount,
        errors: errorCount,
        lock_protocol_count: lockProtocolCount,
        percentage_successful: totalProcessed > 0 ? (successCount / totalProcessed) * 100 : 0,
        percentage_lock_protocol: totalProcessed > 0 ? (lockProtocolCount / totalProcessed) * 100 : 0
      });
      
      return successCount;
    } catch (error) {
      this.logger.error('Failed to reprocess transactions', {
        error: (error as Error).message
      });
      return 0;
    }
  }
  
  /**
   * Handle an incoming transaction
   * @param transaction The transaction to process
   */
  private async handle_transaction(transaction: any): Promise<void> {
    // Try different ways to get the tx_id
    const tx_id = transaction?.tx?.h || transaction?.hash || transaction?.id || transaction?.tx_id;
    
    if (!tx_id) {
      this.logger.warn('Received transaction without ID', { transaction });
      return;
    }
    
    // Extract block height from transaction
    const block_height = transaction?.block?.height || transaction?.height || transaction?.block_height;
    
    // Store transaction data including block height in a map
    if (block_height) {
      this.txBlockHeights.set(tx_id, block_height);
      this.logger.debug('Stored block height for transaction', { tx_id, block_height });
    }
    
    // Log transaction detection
    this.logger.info('🔍 TRANSACTION DETECTED', {
      tx_id,
      block_height,
      type: 'incoming'
    });
    
    // Skip already processed transactions
    if (transaction_cache_service.is_transaction_processed(tx_id)) {
      this.logger.debug('Skipping already processed transaction', { 
        transaction_id: tx_id 
      });
      return;
    }
    
    // Check if we should retry this transaction
    if (!transaction_cache_service.should_retry_transaction(tx_id)) {
      this.logger.debug('Skipping transaction that exceeded retry limit', { 
        transaction_id: tx_id 
      });
      return;
    }
    
    try {
      this.logger.info('Processing transaction', { 
        transaction_id: tx_id,
        block_height: block_height
      });
      
      // Parse the transaction and get the parsed data
      const parsedTransaction = await transaction_data_parser.parse_transaction(transaction);
      
      // Log the parsed transaction data for debugging
      this.logger.info('Transaction parsed with data', {
        transaction_id: tx_id,
        content_type: parsedTransaction.content_type,
        metadata_keys: parsedTransaction.metadata ? Object.keys(parsedTransaction.metadata) : [],
        data_keys: parsedTransaction.data ? Object.keys(parsedTransaction.data) : []
      });
      
      // Log the full parsed transaction for detailed debugging
      this.logger.info('Full parsed transaction', {
        transaction_id: tx_id,
        content_type: parsedTransaction.content_type,
        metadata: parsedTransaction.metadata,
        data: parsedTransaction.data
      });
      
      // Determine transaction type based on the parsed data
      let type = 'post'; // Default to 'post' instead of 'unknown'
      
      // Create a properly typed metadata structure that follows KISS principles
      let enhancedMetadata: {
        original_transaction: any;
        translated_data: any;
        [key: string]: any;
      } = {
        // Include the full original transaction data
        original_transaction: transaction,
        // Prepare for the translated data
        translated_data: null
      };

      // Log the parsed transaction for debugging
      this.logger.info('Parsed transaction details', {
        transaction_id: tx_id,
        content_type: parsedTransaction.content_type,
        data_available: !!parsedTransaction.data,
        data_type: parsedTransaction.data ? typeof parsedTransaction.data : 'unavailable',
        data_keys: parsedTransaction.data ? Object.keys(parsedTransaction.data) : []
      });
      
      // Check if this is an already processed transaction with existing metadata
      if (parsedTransaction.metadata && parsedTransaction.metadata.already_processed) {
        // For already processed transactions, use the existing type and metadata
        if (parsedTransaction.content_type) {
          type = parsedTransaction.content_type;
        }
        
        // Use the existing metadata, but remove the already_processed flag
        const existingMetadata = { ...parsedTransaction.metadata };
        delete existingMetadata.already_processed;
        
        // Ensure the transaction data is preserved in translated_data
        if (parsedTransaction.data) {
          // Merge the data with basic transaction details
          enhancedMetadata.translated_data = {
            ...parsedTransaction.data,
            transaction_id: tx_id,
            block_height,
            block_hash: transaction?.block?.hash || '',
            block_time: transaction?.block?.time || Math.floor(Date.now() / 1000)
          };
        } else if (existingMetadata.translated_data) {
          // If data is missing but translated_data exists in metadata, use that
          enhancedMetadata.translated_data = existingMetadata.translated_data;
        }
        
        this.logger.info('Using existing metadata for already processed transaction', {
          transaction_id: tx_id,
          type,
          data_keys: enhancedMetadata.translated_data ? Object.keys(enhancedMetadata.translated_data) : []
        });
      } else if (parsedTransaction.content_type === 'lock_protocol' && parsedTransaction.data) {
        const lockData = parsedTransaction.data;
        
        // Log the raw lock data for debugging
        this.logger.info('Raw lock data for transaction', {
          transaction_id: tx_id,
          action: lockData.action,
          is_vote: lockData.is_vote,
          raw_data_keys: lockData.raw_data ? Object.keys(lockData.raw_data) : []
        });
        
        // Set type based on the action type and raw data
        if (lockData.action === 'post') {
          // For posts, check if it's a vote post or regular post
          const isVote = lockData.is_vote || 
                        (lockData.raw_data && lockData.raw_data.is_vote === 'true') ||
                        (lockData.raw_data && lockData.raw_data.vote_options && lockData.raw_data.vote_options.length > 0);
          
          type = isVote ? 'vote' : 'post';
          
          // Update is_vote in lock data for consistency
          lockData.is_vote = isVote;
        } else if (lockData.action === 'like') {
          type = 'like';
        } else if (lockData.action === 'vote') {
          type = 'vote';
        } else if (lockData.action === 'comment') {
          type = 'comment';
        }
        
        // Create a comprehensive translated_data object with Lock protocol information
        enhancedMetadata.translated_data = {
          // Include transaction details
          transaction_id: tx_id,
          block_height,
          block_hash: transaction?.block?.hash || '',
          block_time: transaction?.block?.time || Math.floor(Date.now() / 1000),
          
          // Include all lock protocol data
          action: lockData.action,
          type: type,
          is_vote: lockData.is_vote,
          content: lockData.content,
          post_id: lockData.post_id,
          author_address: lockData.author_address,
          
          // Include raw data and additional fields if available
          ...(lockData.raw_data || {}),
          ...(lockData.vote_options ? { vote_options: lockData.vote_options } : {})
        };
        
        this.logger.info('Enhanced translated_data created', {
          transaction_id: tx_id,
          translated_data_keys: Object.keys(enhancedMetadata.translated_data)
        });
      } else if (parsedTransaction.data) {
        // Use the data from the parsed transaction if available
        enhancedMetadata.translated_data = {
          // Include basic transaction information
          transaction_id: tx_id,
          block_height,
          block_hash: transaction?.block?.hash || '',
          block_time: transaction?.block?.time || Math.floor(Date.now() / 1000),
          
          // Include all available parsed data
          content_type: parsedTransaction.content_type,
          ...parsedTransaction.data
        };
      } else {
        // If no specific data is available, provide the minimal transaction info
        enhancedMetadata.translated_data = {
          transaction_id: tx_id,
          block_height,
          block_hash: transaction?.block?.hash || '',
          block_time: transaction?.block?.time || Math.floor(Date.now() / 1000),
          content_type: parsedTransaction.content_type || 'unknown'
        };
      }
      
      // Log the enhanced metadata for debugging
      this.logger.info('Enhanced metadata for transaction', {
        transaction_id: tx_id,
        type,
        metadata_keys: Object.keys(enhancedMetadata)
      });
      
      // Manually save to the database to ensure it's properly saved
      await transaction_client.save_processed_transaction({
        tx_id: tx_id,
        block_height: block_height || 0,
        block_time: transaction?.block?.time || Math.floor(Date.now() / 1000),
        type: type,
        protocol: 'lock',
        metadata: enhancedMetadata
      });
      
      // Mark transaction as processed in cache
      transaction_cache_service.mark_transaction_processed(
        tx_id,
        true
      );
      
      this.logger.info('Transaction processed successfully', { 
        transaction_id: tx_id 
      });
    } catch (error) {
      this.logger.error('Failed to process transaction', { 
        transaction_id: tx_id,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      // Create clean metadata for error case following KISS principles
      const errorMetadata = {
        // Preserve the original transaction
        original_transaction: transaction,
        // Provide translated_data as null but include error information within an error object
        // This maintains our clean structure while providing error details
        translated_data: null,
        // Include error information in a dedicated error object
        error: {
          message: (error as Error).message,
          stack: (error as Error).stack
        }
      };
      
      // Save the failed transaction to the database with error metadata
      try {
        await transaction_client.save_processed_transaction({
          tx_id: tx_id,
          block_height: block_height || 0,
          block_time: transaction?.block?.time || Math.floor(Date.now() / 1000),
          type: 'unknown', // Use 'unknown' for failed transactions
          protocol: 'lock',
          metadata: errorMetadata
        });
      } catch (dbError) {
        this.logger.error('Failed to save failed transaction to database', {
          transaction_id: tx_id,
          error: (dbError as Error).message
        });
      }
      
      // Mark transaction as failed in cache
      transaction_cache_service.mark_transaction_processed(
        tx_id,
        false,
        (error as Error).message
      );
    }
  }
  
  /**
   * Handle a mempool transaction
   * @param transaction The mempool transaction to process
   */
  private async handle_mempool_transaction(transaction: any): Promise<void> {
    // Process mempool transactions the same way as regular transactions
    await this.handle_transaction(transaction);
  }
  
  /**
   * Handle status updates from JungleBus
   * @param status The status update
   */
  private async handle_status(status: any): Promise<void> {
    // Only log block completion and waiting status
    if (status.statusCode === ControlMessageStatusCode.WAITING) {
      this.logger.info("⏳ Waiting for new blocks", { current_block: status.block });
    } else if (status.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
      this.logger.info("✓ Block scanned", { block: status.block });
    } else if (status.statusCode === ControlMessageStatusCode.REORG) {
      this.logger.info("🔄 REORG TRIGGERED", status);
    } else if (status.statusCode === ControlMessageStatusCode.ERROR) {
      this.logger.error("❌ JungleBus Status Error", status);
    }
  }
  
  /**
   * Handle an error from JungleBus
   * @param error The error that occurred
   * @param transactionId Optional transaction ID if the error is related to a specific transaction
   */
  private async handle_error(error: Error, transactionId?: string): Promise<void> {
    if (transactionId) {
      this.logger.error('Error processing transaction', { 
        transaction_id: transactionId,
        error: error.message,
        stack: error.stack
      });
      
      // Mark transaction as failed
      transaction_cache_service.mark_transaction_processed(
        transactionId,
        false,
        error.message
      );
    } else {
      this.logger.error('JungleBus subscription error', { 
        error: error.message,
        stack: error.stack
      });
      
      // Reset scanner state
      this.isRunning = false;
      this.subscriptionId = null;
    }
  }
}

// Create singleton instance
export const scanner = new Scanner();

// Export default for direct instantiation
export default Scanner;

// Main function to run the scanner when this file is executed directly
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    const startBlock = args.length > 0 ? parseInt(args[0], 10) : 0;
    
    // Check if we should clean up the database
    const shouldCleanup = process.env.CLEANUP_DB === 'true';
    
    if (shouldCleanup) {
      console.log('Cleaning up database before starting scanner...');
      // TODO: Implement database cleanup
    }
    
    // Create scanner with specified start block
    const scannerInstance = new Scanner({ startBlock });
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('Received SIGINT. Shutting down scanner...');
      await scannerInstance.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM. Shutting down scanner...');
      await scannerInstance.stop();
      process.exit(0);
    });
    
    // Start the scanner
    await scannerInstance.start();
    
    console.log('Scanner is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Failed to start scanner:', (error as Error).message);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (process.argv[1] === import.meta.url) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
