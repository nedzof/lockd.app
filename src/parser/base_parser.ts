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
            
            // Convert camelCase to snake_case if detected
            let normalized = lowerKey;
            if (/[a-z][A-Z]/.test(key)) {
                normalized = key
                    .replace(/([a-z])([A-Z])/g, '$1_$2')
                    .toLowerCase()
                    .trim();
            }
            
            // Map common alternative spellings to standard keys
            const keyMap: Record<string, string> = {
                // Content and media keys
                'content_type': 'content_type',
                'contenttype': 'content_type',
                'contentType': 'content_type',
                'type': 'content_type', 
                
                // File and image keys
                'filename': 'filename',
                'file_name': 'filename',
                'fileName': 'filename',
                'name': 'filename',
                
                // Lock protocol specific keys
                'lock_amount': 'lock_amount',
                'lockamount': 'lock_amount',
                'lockAmount': 'lock_amount',
                
                'lock_duration': 'lock_duration',
                'lockduration': 'lock_duration',
                'lockDuration': 'lock_duration',
                
                'is_locked': 'is_locked',
                'islocked': 'is_locked',
                'isLocked': 'is_locked',
                
                'is_vote': 'is_vote',
                'isvote': 'is_vote',
                'isVote': 'is_vote',
                
                // Vote related keys
                'options_hash': 'options_hash',
                'optionshash': 'options_hash',
                'optionsHash': 'options_hash',
                
                'vote_options': 'vote_options',
                'voteoptions': 'vote_options',
                'voteOptions': 'vote_options',
                
                'vote_question': 'vote_question',
                'votequestion': 'vote_question',
                'voteQuestion': 'vote_question',
                
                'total_options': 'total_options',
                'totaloptions': 'total_options',
                'totalOptions': 'total_options',
                
                // Post reference keys
                'post_id': 'post_id',
                'postid': 'post_id',
                'postId': 'post_id',
            };
            
            return keyMap[normalized] || normalized;
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
