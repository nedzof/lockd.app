/**
 * Base Parser class with common functionality for all parsers
 */
import { logger } from '../utils/logger.js';

export class BaseParser {
    protected readonly MAX_CACHE_SIZE = 1000;
    
    /**
     * Helper function to safely normalize keys with potential Unicode characters
     */
    protected normalizeKey(key: string): string {
        try {
            if (!key) return '';
            
            // Handle common key variations
            const lowerKey = key.toLowerCase().trim();
            
            // Map common alternative spellings to standard keys
            const keyMap: Record<string, string> = {
                'content_type': 'content_type',
                'contenttype': 'content_type',
                'contentType': 'content_type',
                'type': 'content_type', // Sometimes 'type' is used instead of 'content_type'
                
                'filename': 'filename',
                'file_name': 'filename',
                'fileName': 'filename',
                'name': 'filename', // Sometimes 'name' is used instead of 'filename'
            };
            
            return keyMap[lowerKey] || lowerKey;
        } catch (error) {
            logger.warn('Error in normalizeKey', {
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            return key || '';
        }
    }
    
    /**
     * Helper function to safely decode hex strings using Node.js Buffer
     */
    protected decodeHexString(hexString: string): string {
        try {
            // Check if it's a valid hex string
            if (!/^[0-9a-fA-F]+$/.test(hexString)) {
                return hexString;
            }
            
            // Decode the hex string
            return Buffer.from(hexString, 'hex').toString('utf8');
        } catch (error) {
            logger.warn('Error decoding hex string', {
                error: error instanceof Error ? error.message : String(error),
                hexString: hexString.substring(0, 20) + '...' // Only log a portion for privacy
            });
            return hexString;
        }
    }
    
    /**
     * Helper function to sanitize strings for database storage
     */
    protected sanitizeForDb(str: string): string {
        if (!str) return '';
        
        try {
            // Replace non-printable characters
            return str
                .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
                .replace(/\\u0000/g, '') // Remove NULL characters
                .trim();
        } catch (error) {
            logger.warn('Error sanitizing string for DB', {
                error: error instanceof Error ? error.message : String(error)
            });
            return str;
        }
    }
    
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
}
