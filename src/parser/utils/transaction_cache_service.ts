/**
 * Transaction Cache Service
 * 
 * Manages transaction processing cache to track processed transactions,
 * record failed transaction attempts, and implement cache pruning.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { createLogger, format, transports, Logger } from 'winston';

interface CacheEntry {
  transactionId: string;
  processedAt: number;
  success: boolean;
  error?: string;
  retryCount: number;
}

export class TransactionCacheService {
  private cache: Map<string, CacheEntry>;
  private logger: Logger;
  private maxCacheSize: number;
  private maxRetryCount: number;
  
  constructor(maxCacheSize = 10000, maxRetryCount = 3) {
    this.cache = new Map<string, CacheEntry>();
    this.maxCacheSize = maxCacheSize;
    this.maxRetryCount = maxRetryCount;
    
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
  }
  
  /**
   * Check if a transaction has been processed
   * @param transactionId The transaction ID to check
   * @returns True if the transaction has been successfully processed
   */
  is_transaction_processed(transactionId: string): boolean {
    const entry = this.cache.get(transactionId);
    return !!entry && entry.success;
  }
  
  /**
   * Check if a transaction should be retried
   * @param transactionId The transaction ID to check
   * @returns True if the transaction should be retried
   */
  should_retry_transaction(transactionId: string): boolean {
    const entry = this.cache.get(transactionId);
    
    if (!entry) {
      // Transaction not in cache, should be processed
      return true;
    }
    
    if (entry.success) {
      // Already successfully processed
      return false;
    }
    
    // Retry if we haven't exceeded the max retry count
    return entry.retryCount < this.maxRetryCount;
  }
  
  /**
   * Mark a transaction as processed
   * @param transactionId The transaction ID to mark
   * @param success Whether the processing was successful
   * @param error Optional error message if processing failed
   */
  mark_transaction_processed(
    transactionId: string, 
    success: boolean = true, 
    error: string | null = null
  ): void {
    const now = Date.now();
    const existingEntry = this.cache.get(transactionId);
    
    const entry: CacheEntry = {
      transactionId,
      processedAt: now,
      success,
      error: error || undefined,
      retryCount: existingEntry ? existingEntry.retryCount + 1 : 0
    };
    
    this.cache.set(transactionId, entry);
    
    // Log the transaction processing
    this.logger.info('Transaction processed', {
      transaction_id: transactionId,
      success,
      retry_count: entry.retryCount,
      error: error || undefined
    });
    
    // Prune cache if necessary
    if (this.cache.size > this.maxCacheSize) {
      this.prune_cache();
    }
  }
  
  /**
   * Get the number of transactions in the cache
   * @returns The cache size
   */
  get_cache_size(): number {
    return this.cache.size;
  }
  
  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  get_cache_stats(): { total: number, successful: number, failed: number } {
    let successful = 0;
    let failed = 0;
    
    this.cache.forEach(entry => {
      if (entry.success) {
        successful++;
      } else {
        failed++;
      }
    });
    
    return {
      total: this.cache.size,
      successful,
      failed
    };
  }
  
  /**
   * Clear the entire cache
   */
  clear_cache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }
  
  /**
   * Prune the cache by removing the oldest entries
   * @param prunePercentage Percentage of cache to prune (0-1)
   */
  private prune_cache(prunePercentage = 0.2): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by processed time (oldest first)
    entries.sort((a, b) => a[1].processedAt - b[1].processedAt);
    
    // Calculate how many entries to remove
    const removeCount = Math.ceil(this.cache.size * prunePercentage);
    
    // Remove oldest entries
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    this.logger.info('Cache pruned', {
      removed_count: removeCount,
      new_size: this.cache.size
    });
  }
}

// Export singleton instance
export const transaction_cache_service = new TransactionCacheService();

// Export default for direct instantiation
export default TransactionCacheService;
