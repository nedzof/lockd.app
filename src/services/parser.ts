/**
 * @deprecated This file is maintained for backward compatibility.
 * Please use the new parser module from '../parser' instead.
 */
import { logger } from '../utils/logger.js';
import { DbClient } from './dbClient.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { LockProtocolData, ParsedTransaction } from '../shared/types.js';
import bsv from 'bsv';

// Import the new parser and utilities
import { 
    parser,
    MainParser,
    LockProtocolParser,
    MediaParser,
    VoteParser,
    extract_tags, 
    extract_vote_data, 
    decode_hex_string, 
    sanitize_for_db 
} from '../parser/index.js';

// Re-export the helper functions with original names for backward compatibility
export function extractTags(data: string[]): string[] {
    logger.warn('DEPRECATED: extractTags is deprecated, use extract_tags from the parser module instead');
    return extract_tags(data);
}

// Helper function to extract vote data from transaction data
export function extractVoteData(data: string[]): { 
    isVote: boolean;
    question?: string;
    options?: string[];
    total_options?: number;
    options_hash?: string;
} {
    logger.warn('DEPRECATED: extractVoteData is deprecated, use extract_vote_data from the parser module instead');
    
    // Use the new parser's extract_vote_data function
    const result = extract_vote_data(data);
    
    // Convert the new format to the old format
    return {
        isVote: result.is_vote,
        question: result.question,
        options: result.options,
        total_options: result.total_options,
        options_hash: result.options_hash
    };
}

/**
 * @deprecated This is the legacy TransactionParser class.
 * Please use the new parser module from '../parser' instead.
 */
export class TransactionParser {
    private dbClient: DbClient;
    private jungleBus: JungleBusClient;
    private transactionCache = new Map<string, boolean>();
    private readonly MAX_CACHE_SIZE = 10000;
    
    constructor(dbClient: DbClient) {
        logger.warn('DEPRECATED: TransactionParser is deprecated, use the parser module instead');
        this.dbClient = dbClient;
        
        // Initialize JungleBus client for compatibility
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            protocol: 'json',
            onError: (ctx) => {
                logger.error("❌ JungleBus Parser ERROR", ctx);
            }
        });
        
        logger.info('TransactionParser initialized (using new parser internally)');
    }

    /**
     * Helper function to safely decode hex strings using Node.js Buffer
     * @deprecated Use decode_hex_string from the parser module instead
     */
    public decodeHexString(hexString: string): string {
        logger.warn('DEPRECATED: TransactionParser.decodeHexString is deprecated, use decode_hex_string from the parser module instead');
        return decode_hex_string(hexString);
    }
    
    /**
     * Helper function to sanitize strings for database storage
     * @deprecated Use sanitize_for_db from the parser module instead
     */
    public sanitizeForDb(str: string): string {
        logger.warn('DEPRECATED: TransactionParser.sanitizeForDb is deprecated, use sanitize_for_db from the parser module instead');
        return sanitize_for_db(str);
    }

    /**
     * Process image data and save to database
     * @deprecated Use the parser.process_image method instead
     */
    public async processImage(imageData: Buffer, metadata: any, tx_id: string): Promise<void> {
        try {
            logger.warn('DEPRECATED: TransactionParser.processImage is deprecated, use parser.process_image instead');
            // Delegate to DB client directly
            // Call the database client directly
        // This is deprecated and will be removed in a future version
        // @ts-ignore - Ignoring the type error for backward compatibility
        await this.dbClient.save_image({
                tx_id,
                imageData,
                metadata
            });
        } catch (error) {
            logger.error('Failed to process image', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Extract Lock protocol data from transaction data
     * @deprecated Use the parser.extract_lock_protocol_data method instead 
     */
    public extractLockProtocolData(data: string[], tx: any): LockProtocolData | null {
        logger.warn('DEPRECATED: TransactionParser.extractLockProtocolData is deprecated, use parser.extract_lock_protocol_data instead');
        // We need to create a new instance for compatibility since parser methods are private
        const lockParser = new LockProtocolParser();
        return lockParser.extract_lock_protocol_data(data, tx);
    }

    /**
     * Helper function to normalize keys with potential Unicode characters
     * @deprecated Use the parser module instead
     */
    public normalizeKey(key: string): string {
        logger.warn('DEPRECATED: TransactionParser.normalizeKey is deprecated, use the parser module instead');
        if (!key) return '';
        
        return key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').trim();
    }

    /**
     * Extract image data from a buffer
     * @deprecated Use the parser module instead
     */
    public extractImageData(buffer: Buffer): { 
        image: Buffer | null; 
        format: string | null;
        contentType: string | null;
    } {
        logger.warn('DEPRECATED: TransactionParser.extractImageData is deprecated, use parser.extract_image_data instead');
        // We need to create a new instance for compatibility since parser methods are private
        const mediaParser = new MediaParser();
        const result = mediaParser.extract_image_data(buffer);
        return {
            image: result.image,
            format: result.format,
            contentType: result.content_type
        };
    }

    /**
     * Parse a single transaction
     * @param tx_id Transaction ID to parse
     */
    public async parseTransaction(tx_id: string): Promise<void> {
        logger.warn('DEPRECATED: TransactionParser.parseTransaction is deprecated, use parser.parse_transaction instead');
        
        // Check cache first
        if (this.transactionCache.has(tx_id)) {
            return;
        }
        
        // Add to cache
        this.transactionCache.set(tx_id, true);
        
        // Prune cache if it gets too large
        if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
            const oldestKey = this.transactionCache.keys().next().value;
            this.transactionCache.delete(oldestKey);
        }
        
        return await parser.parse_transaction(tx_id);
    }

    /**
     * Parse multiple transactions in batches
     * @param tx_ids Array of transaction IDs to parse
     */
    public async parseTransactions(tx_ids: string[]): Promise<void> {
        logger.warn('DEPRECATED: TransactionParser.parseTransactions is deprecated, use parser.parse_transactions instead');
        
        // Filter out already processed transactions
        const uniqueTxIds = tx_ids.filter(tx_id => !this.transactionCache.has(tx_id));
        
        // Add to cache
        for (const tx_id of uniqueTxIds) {
            this.transactionCache.set(tx_id, true);
            
            // Prune cache if it gets too large
            if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
                const oldestKey = this.transactionCache.keys().next().value;
                this.transactionCache.delete(oldestKey);
            }
        }
        
        return await parser.parse_transactions(uniqueTxIds);
    }
}
