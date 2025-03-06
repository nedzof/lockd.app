/**
 * Base Parser class with common functionality for all parsers
 * Provides core functionality that all parser classes can inherit from
 */
import { logger } from '../utils/logger.js';

/**
 * BaseParser class that provides common functionality for all parsers:
 * - Transaction caching mechanism
 * - Logging utilities
 * - Cache management
 */
export class BaseParser {
    protected readonly MAX_CACHE_SIZE = 1000;
    protected transactionCache = new Map<string, boolean>();
    
    /**
     * Utility method to log debug information
     */
    protected logDebug(message: string, context: Record<string, any> = {}): void {
        logger.debug(message, context);
    }
    
    /**
     * Utility method to log informational messages
     */
    protected logInfo(message: string, context: Record<string, any> = {}): void {
        logger.info(message, context);
    }
    
    /**
     * Utility method to log warning messages
     */
    protected logWarn(message: string, context: Record<string, any> = {}): void {
        logger.warn(message, context);
    }
    
    /**
     * Utility method to log error messages
     */
    protected logError(message: string, context: Record<string, any> = {}): void {
        logger.error(message, context);
    }
    
    /**
     * Prune the transaction cache if it exceeds the maximum size
     * Common implementation to avoid duplication in derived classes
     */
    protected prune_cache(cacheMap: Map<string, any> = this.transactionCache, maxSize: number = this.MAX_CACHE_SIZE): void {
        if (cacheMap.size > maxSize) {
            // Convert to array of keys
            const keys = Array.from(cacheMap.keys());
            
            // Remove oldest entries (first 20% of the cache)
            const pruneCount = Math.floor(maxSize * 0.2);
            const keysToRemove = keys.slice(0, pruneCount);
            
            for (const key of keysToRemove) {
                cacheMap.delete(key);
            }
            
            this.logInfo('Pruned cache', {
                pruned: pruneCount,
                remaining: cacheMap.size,
                max_size: maxSize
            });
        }
    }
}
