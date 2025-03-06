/**
 * Helper utility functions for transaction parsing
 * 
 * This module contains utility functions used across different parsers
 * and are grouped by their general purpose:
 * 
 * - Binary data processing functions
 * - Transaction data extraction helpers
 * - String manipulation utilities
 * - Data normalization functions
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
 * Helper function to check if buffer contains binary data
 * @param buf Buffer to check
 * @returns true if buffer contains binary data
 */
export function is_binary_data(buf: Buffer): boolean {
    // Check for common binary file signatures
    if (buf.length >= 4) {
        // Check for PNG signature
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
            return true;
        }
        
        // Check for JPEG signature
        if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
            return true;
        }
        
        // Check for GIF signature
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
            return true;
        }
        
        // Check for PDF signature
        if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
            return true;
        }
    }
    
    // Check for binary data by looking for control characters and high-bit characters
    let binaryCount = 0;
    const sampleSize = Math.min(buf.length, 100); // Check first 100 bytes
    
    for (let i = 0; i < sampleSize; i++) {
        const byte = buf[i];
        // Control characters (except common whitespace) or high-bit characters
        if ((byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127) {
            binaryCount++;
        }
    }
    
    // If more than 10% of the sample is binary, consider it binary data
    return binaryCount > sampleSize * 0.1;
}

/**
 * Helper function to extract key-value pairs from a data string
 * @param data Data string to extract key-value pairs from
 * @returns Array of key-value pair strings
 */
export function extract_key_value_pairs(data: string): string[] {
    if (!data || typeof data !== 'string') return [];
    
    const pairs: string[] = [];
    
    // Match key=value patterns
    const keyValueRegex = /([a-zA-Z0-9_]+)=([^&]+)(?:&|$)/g;
    let match;
    
    while ((match = keyValueRegex.exec(data)) !== null) {
        pairs.push(`${match[1]}=${match[2]}`);
    }
    
    // Also try to match JSON-like structures
    try {
        if (data.trim().startsWith('{') && data.trim().endsWith('}')) {
            const jsonData = JSON.parse(data);
            for (const [key, value] of Object.entries(jsonData)) {
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    pairs.push(`${key}=${value}`);
                } else if (value !== null && typeof value === 'object') {
                    // For objects and arrays, stringify them
                    pairs.push(`${key}=${JSON.stringify(value)}`);
                }
            }
        }
    } catch (error) {
        // Ignore JSON parsing errors
    }
    
    return pairs;
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

/**
 * Helper function to normalize key names to snake_case
 * @param key The key to normalize
 * @returns The normalized key in snake_case
 */
export function normalize_key(key: string): string {
    if (!key) return '';
    
    try {
        // Convert camelCase to snake_case
        const snakeCase = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        
        // Handle special cases
        switch (snakeCase) {
            case 'post_id':
            case 'postid':
                return 'post_id';
            case 'author_address':
            case 'authoraddress':
                return 'author_address';
            case 'created_at':
            case 'createdat':
                return 'created_at';
            case 'updated_at':
            case 'updatedat':
                return 'updated_at';
            case 'block_height':
            case 'blockheight':
                return 'block_height';
            case 'block_time':
            case 'blocktime':
                return 'block_time';
            case 'is_vote':
            case 'isvote':
                return 'is_vote';
            case 'is_locked':
            case 'islocked':
                return 'is_locked';
            case 'lock_amount':
            case 'lockamount':
                return 'lock_amount';
            case 'lock_duration':
            case 'lockduration':
                return 'lock_duration';
            case 'raw_image_data':
            case 'rawimagedata':
                return 'raw_image_data';
            case 'media_type':
            case 'mediatype':
                return 'media_type';
            case 'vote_options':
            case 'voteoptions':
                return 'vote_options';
            case 'vote_question':
            case 'votequestion':
                return 'vote_question';
            case 'total_options':
            case 'totaloptions':
                return 'total_options';
            case 'options_hash':
            case 'optionshash':
                return 'options_hash';
            case 'option_index':
            case 'optionindex':
                return 'option_index';
            case 'image_metadata':
            case 'imagemetadata':
                return 'image_metadata';
            case 'content_type':
            case 'contenttype':
                return 'content_type';
            default:
                return snakeCase;
        }
    } catch (error) {
        logger.warn('Error normalizing key', {
            error: error instanceof Error ? error.message : String(error),
            key
        });
        return key;
    }
}

/**
 * Helper function to process buffer data and handle binary content
 * @param buf Buffer to process
 * @param txId Transaction ID for logging
 * @returns Processed string or hex-encoded string for binary data, with content type metadata
 */
export function process_buffer_data(buf: Buffer, txId: string): string {
    // First check for common binary file signatures to determine content type
    let contentType = '';
    let isMedia = false;
    
    // Check for common file signatures
    if (buf.length >= 4) {
        // Check for PNG signature: 89 50 4E 47
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
            contentType = 'image/png';
            isMedia = true;
        } 
        // Check for JPEG signature: FF D8 FF
        else if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
            contentType = 'image/jpeg';
            isMedia = true;
        }
        // Check for GIF signature: 47 49 46 38 (GIF8)
        else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
            contentType = 'image/gif';
            isMedia = true;
            logger.info('Detected GIF image data', {
                tx_id: txId,
                size: buf.length,
                signature: 'GIF8'
            });
        }
        // Check for PDF signature: 25 50 44 46
        else if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
            contentType = 'application/pdf';
            isMedia = true;
        }
    }
    
    // If any media type was detected above or general binary data is detected
    if (isMedia || is_binary_data(buf)) {
        // For binary data, use hex encoding with a prefix
        const hex = buf.toString('hex');
        
        // Add content type metadata if available
        if (contentType) {
            logger.info('Encoded binary data with content type', {
                tx_id: txId,
                content_type: contentType,
                data_size: buf.length
            });
            // Include content type in the metadata to help Scanner and TransactionDataParser
            return `hex:${hex}|content_type=${contentType}`;
        }
        
        return `hex:${hex}`;
    }
    
    // Try UTF-8 conversion for non-binary data
    try {
        const str = sanitize_for_db(buf.toString('utf8'));
        
        // Check if the string contains invalid characters (often means it wasn't really UTF-8)
        if (str.includes('\ufffd') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
            // If the string has invalid characters, use hex instead
            const hex = buf.toString('hex');
            logger.debug('Buffer contains invalid UTF-8, using hex', {
                tx_id: txId,
                hex_preview: hex.substring(0, 20) + '...'
            });
            return `hex:${hex}`;
        } else {
            // Use the UTF-8 string if it looks valid
            return str;
        }
    } catch (strError) {
        // If UTF-8 conversion fails entirely, use hex
        const hex = buf.toString('hex');
        logger.debug('Error converting buffer to UTF-8, using hex', {
            tx_id: txId,
            error: strError instanceof Error ? strError.message : String(strError),
            hex_preview: hex.substring(0, 20) + '...'
        });
        return `hex:${hex}`;
    }
}
