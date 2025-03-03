/**
 * Helper utility functions for transaction parsing
 */
import { logger } from '../../utils/logger.js';

/**
 * Helper function to extract tags from transaction data
 */
export function extract_tags(data: string[]): string[] {
    if (!Array.isArray(data)) {
        return [];
    }
    
    try {
        // Extract all tags from the data array
        const tags = data
            .filter(item => item && typeof item === 'string' && item.startsWith('tags='))
            .map(item => item.replace('tags=', ''))
            .filter(tag => tag.trim() !== '');
        
        // Remove duplicates
        return [...new Set(tags)];
    } catch (error) {
        logger.warn('Error extracting tags', {
            error: error instanceof Error ? error.message : String(error)
        });
        return [];
    }
}

/**
 * Helper function to extract vote data from transaction data
 */
export function extract_vote_data(data: string[]): { 
    is_vote: boolean;
    question?: string;
    options?: string[];
    total_options?: number;
    options_hash?: string;
} {
    const result = {
        is_vote: false,
        question: undefined,
        options: undefined as string[] | undefined,
        total_options: undefined,
        options_hash: undefined
    };
    
    if (!Array.isArray(data)) {
        return result;
    }
    
    try {
        // Check vote indicators
        result.is_vote = data.some(item => {
            if (typeof item !== 'string') return false;
            
            const plainText = item.includes('is_vote=true') || 
                            item.includes('isVote=true') ||
                            item.includes('content_type=vote') ||
                            item.includes('type=vote_question') ||
                            item === 'VOTE';
                            
            if (plainText) return true;
            
            // Check hex encoded data
            if (item.match(/^[0-9a-fA-F]+$/)) {
                try {
                    const decoded = Buffer.from(item, 'hex').toString('utf8');
                    return decoded.includes('is_vote=true') || 
                        decoded.includes('isVote=true') ||
                        decoded.includes('content_type=vote') ||
                        decoded.includes('type=vote_question') ||
                        decoded === 'VOTE';
                } catch {
                    return false;
                }
            }
            
            return false;
        });
        
        if (!result.is_vote) {
            return result;
        }
        
        // Look for vote question and options
        let foundQuestion = false;
        const options: string[] = [];
        
        for (const item of data) {
            if (typeof item !== 'string') continue;
            
            // Skip non-content items
            if (item.startsWith('tags=') || 
                item.startsWith('is_vote=') || 
                item.startsWith('isVote=') || 
                item.startsWith('content_type=') || 
                item.startsWith('type=') || 
                item === 'VOTE') {
                continue;
            }
            
            // First content item after vote flag is the question
            if (!foundQuestion) {
                result.question = item;
                foundQuestion = true;
                continue;
            }
            
            // Subsequent items are options
            options.push(item);
        }
        
        if (options.length > 0) {
            result.options = options;
            result.total_options = options.length;
            
            // Generate an options hash
            const optionsString = options.join('|');
            result.options_hash = Buffer.from(optionsString).toString('base64');
        }
    } catch (error) {
        logger.warn('Error extracting vote data', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return result;
}

/**
 * Helper function to safely decode hex strings using Node.js Buffer
 */
export function decode_hex_string(hexString: string): string {
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
export function sanitize_for_db(str: string): string {
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
