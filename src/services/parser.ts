import { logger } from '../utils/logger.js';
import { DbClient } from './dbClient.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { LockProtocolData, ParsedTransaction } from '../shared/types.js';
import * as bsv from 'bsv';

// Helper function to extract tags from transaction data
export function extractTags(data: string[]): string[] {
    if (!Array.isArray(data)) {
        return [];
    }
    
    // Extract all tags from the data array
    const tags = data
        .filter(item => item.startsWith('tags='))
        .map(item => item.replace('tags=', ''))
        .filter(tag => tag.trim() !== '');
    
    // Remove duplicates
    return [...new Set(tags)];
}

// Helper function to extract vote data from transaction data
export function extractVoteData(data: string[]): { 
    isVote: boolean;
    question?: string;
    options?: string[];
    total_options?: number;
    options_hash?: string;
} {
    const result = {
        isVote: false,
        question: undefined,
        options: undefined,
        total_options: undefined,
        options_hash: undefined
    };
    
    // Check vote indicators
    result.isVote = data.some(item => {
        if (typeof item !== 'string') return false;
        
        const plainText = item.includes('is_vote=true') || 
                         item.includes('isVote=true') ||
                         item.includes('content_type=vote') ||
                         item.includes('type=vote_question') ||
                         item === 'VOTE';
                         
        if (plainText) return true;
        
        // Check hex encoded data
        if (item.match(/^[0-9a-fA-F]+$/)) {
            const decoded = decodeHexString(item);
            return decoded.includes('is_vote=true') || 
                   decoded.includes('isVote=true') ||
                   decoded.includes('content_type=vote') ||
                   decoded.includes('type=vote_question') ||
                   decoded === 'VOTE';
        }
        
        return false;
    });
    
    if (!result.isVote) return result;
    
    // Look for a question and options
    let foundQuestion = false;
    let optionsStartIndex = -1;
    
    // First pass: find the question and where options start
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (typeof item !== 'string') continue;
        
        // Skip empty items
        if (!item.trim()) continue;
        
        // Skip protocol indicators
        if (item === 'LOCK' || item === 'VOTE' || 
            item.includes('app=lockd.app') || 
            item.includes('is_vote=true')) {
            continue;
        }
        
        // If we haven't found a question yet, this might be it
        if (!foundQuestion) {
            result.question = item;
            foundQuestion = true;
            optionsStartIndex = i + 1;
            continue;
        }
    }
    
    // Second pass: collect options if we found a question
    if (foundQuestion && optionsStartIndex >= 0) {
        result.options = [];
        
        for (let i = optionsStartIndex; i < data.length; i++) {
            const item = data[i];
            if (typeof item !== 'string' || !item.trim()) continue;
            
            // Skip protocol indicators
            if (item === 'LOCK' || item === 'VOTE' || 
                item.includes('app=lockd.app') || 
                item.includes('is_vote=true')) {
                continue;
            }
            
            // Add as an option
            result.options.push(item);
        }
        
        // Set total options
        if (result.options.length > 0) {
            result.total_options = result.options.length;
        }
    }
    
    // Fallback to the old method if we didn't find options
    if (!result.options) {
        // Process each data item for vote information
        for (const item of data) {
            if (typeof item !== 'string') continue;
            
            let decoded = item;
            // If it looks like hex, decode it
            if (item.match(/^[0-9a-fA-F]+$/)) {
                decoded = decodeHexString(item);
            }
            
            // Extract question
            if (decoded.includes('vote_question=') || decoded.includes('voteQuestion=')) {
                const questionMatch = decoded.match(/(?:vote_question|voteQuestion)=([^&\s]+)/);
                if (questionMatch && questionMatch[1]) {
                    result.question = questionMatch[1];
                }
            }
            
            // Extract options
            if (decoded.includes('vote_options=') || decoded.includes('voteOptions=')) {
                const optionsMatch = decoded.match(/(?:vote_options|voteOptions)=([^&\s]+)/);
                if (optionsMatch && optionsMatch[1]) {
                    try {
                        // Try to parse as JSON
                        if (optionsMatch[1].startsWith('[') && optionsMatch[1].endsWith(']')) {
                            result.options = JSON.parse(optionsMatch[1]);
                        } else {
                            // Otherwise split by comma
                            result.options = optionsMatch[1].split(',').map(opt => opt.trim());
                        }
                        result.total_options = result.options.length;
                    } catch {
                        // If parsing fails, just use the raw value
                        result.options = [optionsMatch[1]];
                        result.total_options = 1;
                    }
                }
            }
            
            // Extract options hash
            if (decoded.includes('options_hash=') || decoded.includes('optionsHash=')) {
                const hashMatch = decoded.match(/(?:options_hash|optionsHash)=([^&\s]+)/);
                if (hashMatch && hashMatch[1]) {
                    result.options_hash = hashMatch[1];
                }
            }
            
            // Extract total options
            if (decoded.includes('total_options=') || decoded.includes('totalOptions=')) {
                const totalMatch = decoded.match(/(?:total_options|totalOptions)=(\d+)/);
                if (totalMatch && totalMatch[1]) {
                    result.total_options = parseInt(totalMatch[1], 10);
                }
            }
        }
    }
    
    // Debug log the extracted vote data
    logger.debug('Extracted vote data', {
        isVote: result.isVote,
        question: result.question,
        options: result.options,
        total_options: result.total_options
    });
    
    return result;
}

// Helper function to safely normalize keys with potential Unicode characters
const normalizedKeyCache = new Map<string, string>();
const MAX_KEY_CACHE_SIZE = 1000;

function normalizeKey(key: string): string {
    if (!key) return '';
    
    // Check cache first
    if (normalizedKeyCache.has(key)) {
        return normalizedKeyCache.get(key)!;
    }
    
    const normalized = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').trim();
    
    // Only cache if cache isn't too large
    if (normalizedKeyCache.size < MAX_KEY_CACHE_SIZE) {
        normalizedKeyCache.set(key, normalized);
    }
    
    return normalized;
}

// Helper function to safely decode hex strings using Node.js Buffer
function decodeHexString(hexString: string): string {
    if (!hexString || typeof hexString !== 'string' || !/^[0-9a-fA-F]+$/.test(hexString)) {
        return hexString || ''; // Return as-is if not a valid hex string
    }
    
    try {
        return Buffer.from(hexString, 'hex').toString('utf8');
    } catch {
        return '';
    }
}

// Helper function to sanitize strings for database storage
function sanitizeForDb(str: string): string {
    if (!str) return '';
    
    // Replace null bytes and other problematic control characters
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
              .replace(/\\u0000/g, '')
              .trim();
}

export class TransactionParser {
    private dbClient: DbClient;
    private jungleBus: JungleBusClient;
    private transactionCache = new Map<string, boolean>();
    private readonly MAX_CACHE_SIZE = 10000;

    constructor(dbClient: DbClient) {
        this.dbClient = dbClient;
        
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });

        // Initialize JungleBus client
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            protocol: 'json',
            onError: (ctx) => {
                logger.error("❌ JungleBus Parser ERROR", ctx);
            }
        });
    }

    // Process image data and save to database
    private async processImage(imageData: Buffer, metadata: any, tx_id: string): Promise<void> {
        try {
            logger.debug('Starting image processing', {
                tx_id,
                has_imageData: !!imageData,
                metadataKeys: metadata ? Object.keys(metadata) : [],
                content_type: metadata?.content_type
            });

            if (!imageData || !metadata.content_type) {
                throw new Error('Invalid image data or content type');
            }

            // Log dbClient details before calling saveImage
            logger.debug('DbClient before saveImage', {
                dbClientType: typeof this.dbClient,
                dbClientMethods: Object.keys(this.dbClient),
                dbClientInstance: this.dbClient instanceof DbClient
            });

            // Save image data using DbClient
            await this.dbClient.save_image({
                tx_id,
                imageData,
                content_type: metadata.content_type,
                filename: metadata.filename || 'image.jpg',
                width: metadata.width,
                height: metadata.height,
                size: imageData.length
            });

            logger.info('Successfully processed and saved image', {
                tx_id,
                content_type: metadata.content_type,
                size: imageData.length
            });
        } catch (error) {
            logger.error('Failed to process image', {
                error: error instanceof Error ? error.message : 'Unknown error',
                tx_id
            });
            throw error;
        }
    }

    private extractLockProtocolData(data: string[], tx: any): LockProtocolData | null {
        // Create initial metadata structure
        const metadata: LockProtocolData = {
            post_id: '',
            created_at: null,
            content: '',
            tags: [],
            is_vote: false,
            is_locked: false,
            lock_amount: 0,
            lock_duration: 0,
            raw_image_data: null,
            media_type: null,
            vote_options: null,
            vote_question: null,
            total_options: null,
            options_hash: null,
            image: null,
            image_metadata: {
                filename: '',
                content_type: '',
                is_image: false
            }
        };
        
        try {
            // Check if this is a LOCK protocol transaction
            const isLockApp = data.some(item => {
                if (typeof item !== 'string') return false;
                return item.includes('app=lockd.app') || 
                       (item.match(/^[0-9a-fA-F]+$/) && decodeHexString(item).includes('app=lockd.app'));
            });
            
            if (!isLockApp) {
                logger.warn('Not a Lock protocol transaction', { tx_id: tx?.id || 'unknown' });
                return null;
            }

            logger.info('Found LOCK protocol transaction', { tx_id: tx?.id || 'unknown' });

            // Initialize isLockProtocol flag
            let isLockProtocol = false;

            // Process lock protocol data
            const lockData: Record<string, any> = {
                post_id: '',
                created_at: new Date().toISOString(),
                content: '',
                tags: [],
                is_vote: false,
                is_locked: false
            };

            // Parse the data array for lock protocol data
            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                
                // Check for lock protocol
                if (item === 'LOCK' || item.includes('LOCK')) {
                    isLockProtocol = true;
                    continue;
                }
                
                // Skip non-lock protocol transactions
                if (!isLockProtocol) {
                    continue;
                }
                
                // Check for content
                if (item.length > 0 && !lockData.content && item !== 'LOCK') {
                    lockData.content = item;
                    continue;
                }
                
                // Check for vote
                if (item === 'VOTE' || item.includes('VOTE')) {
                    lockData.is_vote = true;
                    continue;
                }
                
                // Check for vote options
                if (lockData.is_vote && !lockData.vote_options) {
                    // Initialize vote options array
                    lockData.vote_options = [];
                    lockData.vote_question = item;
                    lockData.total_options = 0;
                    continue;
                }
                
                // Add vote options
                if (lockData.is_vote && lockData.vote_options && item !== lockData.vote_question) {
                    lockData.vote_options.push(item);
                    lockData.total_options = lockData.vote_options.length;
                    continue;
                }
                
                // Check for lock amount
                if (item.includes('LOCK_AMOUNT')) {
                    const parts = item.split('=');
                    if (parts.length === 2) {
                        const amount = parseInt(parts[1].trim(), 10);
                        if (!isNaN(amount)) {
                            lockData.lock_amount = amount;
                            lockData.is_locked = true;
                        }
                    }
                    continue;
                }
                
                // Check for lock duration
                if (item.includes('LOCK_DURATION')) {
                    const parts = item.split('=');
                    if (parts.length === 2) {
                        const duration = parseInt(parts[1].trim(), 10);
                        if (!isNaN(duration)) {
                            lockData.lock_duration = duration;
                        }
                    }
                    continue;
                }
                
                // Check for tags
                if (item.startsWith('#')) {
                    lockData.tags.push(item.substring(1));
                    continue;
                }
            }

            // Map lockData to metadata
            metadata.post_id = lockData.post_id;
            metadata.created_at = lockData.created_at;
            metadata.content = lockData.content;
            metadata.tags = lockData.tags;
            metadata.is_vote = lockData.is_vote;
            metadata.is_locked = lockData.is_locked;
            metadata.lock_amount = lockData.lock_amount;
            metadata.lock_duration = lockData.lock_duration;
            metadata.vote_options = lockData.vote_options;
            metadata.vote_question = lockData.vote_question;
            metadata.total_options = lockData.total_options;

            // Handle image data
            if (metadata.image_metadata.is_image && tx.transaction) {
                try {
                    // Get raw transaction data
                    const buffer = Buffer.from(tx.transaction, 'base64');
                    
                    // Extract image data
                    const { image, format, contentType } = this.extractImageData(buffer);
                    
                    if (image) {
                        metadata.image = image;
                        metadata.image_metadata.content_type = metadata.image_metadata.content_type || contentType || 'image/jpeg';
                        metadata.image_metadata.filename = metadata.image_metadata.filename || `image.${format || 'jpg'}`;
                    }
                } catch (error) {
                    logger.error('Failed to process image data', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        tx_id: tx.id
                    });
                }
            }
            
            // Extract vote data
            const voteData = extractVoteData(data);
            if (voteData.isVote) {
                metadata.is_vote = voteData.isVote;
                metadata.vote_question = voteData.question;
                metadata.vote_options = voteData.options;
                metadata.total_options = voteData.total_options;
                metadata.options_hash = voteData.options_hash;
                
                // Log the extracted vote data
                logger.info('Extracted vote data from transaction', {
                    tx_id: tx?.id || 'unknown',
                    question: voteData.question,
                    options: voteData.options,
                    total_options: voteData.total_options
                });
            }
            
            return metadata;
        } catch (error) {
            logger.error('Failed to extract Lock protocol data', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                tx_id: tx?.id || 'unknown'
            });
            return null;
        }
    }

    // Helper function to process key-value pairs
    private processKeyValuePair(key: string, value: string, metadata: LockProtocolData): void {
        if (!key || !value) return;
        
        try {
            // Sanitize the value for database storage
            const sanitizedValue = sanitizeForDb(value);
            
            // Process based on normalized key
            switch (key) {
                case 'post_id':
                case 'postid':
                    metadata.post_id = sanitizedValue;
                    break;
                case 'content':
                    metadata.content = sanitizedValue;
                    break;
                case 'is_vote':
                    metadata.is_vote = sanitizedValue.toLowerCase() === 'true';
                    break;
                case 'is_locked':
                    metadata.is_locked = sanitizedValue.toLowerCase() === 'true';
                    break;
                case 'lock_amount':
                    metadata.lock_amount = parseInt(sanitizedValue, 10) || 0;
                    break;
                case 'lock_duration':
                    metadata.lock_duration = parseInt(sanitizedValue, 10) || 0;
                    break;
                case 'vote_question':
                    metadata.vote_question = sanitizedValue;
                    break;
                case 'vote_options':
                    try {
                        if (sanitizedValue.startsWith('[') && sanitizedValue.endsWith(']')) {
                            metadata.vote_options = JSON.parse(sanitizedValue);
                        } else {
                            metadata.vote_options = sanitizedValue.split(',').map(opt => opt.trim());
                        }
                    } catch {
                        metadata.vote_options = [sanitizedValue];
                    }
                    break;
                case 'total_options':
                    metadata.total_options = parseInt(sanitizedValue, 10) || null;
                    break;
                case 'options_hash':
                    metadata.options_hash = sanitizedValue;
                    break;
                case 'media_type':
                    metadata.media_type = sanitizedValue;
                    break;
                case 'image':
                    // Mark as having an image
                    metadata.image_metadata.is_image = true;
                    metadata.image_metadata.content_type = 'image/jpeg'; // Default
                    break;
                case 'image_type':
                case 'content_type':
                    metadata.image_metadata.content_type = sanitizedValue;
                    metadata.image_metadata.is_image = true;
                    break;
                case 'filename':
                    metadata.image_metadata.filename = sanitizedValue;
                    break;
                case 'tags':
                    try {
                        if (sanitizedValue.startsWith('[') && sanitizedValue.endsWith(']')) {
                            metadata.tags = JSON.parse(sanitizedValue);
                        } else {
                            metadata.tags = sanitizedValue.split(',').map(tag => tag.trim());
                        }
                    } catch {
                        metadata.tags = [sanitizedValue];
                    }
                    break;
            }
        } catch (error) {
            logger.warn('Failed to process key-value pair', {
                key,
                value: value.substring(0, 100),
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Extract image data from a buffer
     * @param buffer The buffer containing the image data
     * @returns Object containing the extracted image and format information
     */
    private extractImageData(buffer: Buffer): { 
        image: Buffer | null; 
        format: string | null;
        contentType: string | null;
    } {
        try {
            // Define image format signatures
            const formats = [
                { format: 'jpeg', marker: Buffer.from([0xFF, 0xD8, 0xFF]), contentType: 'image/jpeg' },
                { format: 'png', marker: Buffer.from([0x89, 0x50, 0x4E, 0x47]), contentType: 'image/png' },
                { format: 'gif', marker: Buffer.from([0x47, 0x49, 0x46, 0x38]), contentType: 'image/gif' }
            ];
            
            // Find the first matching format
            for (const { format, marker, contentType } of formats) {
                const index = buffer.indexOf(marker);
                if (index !== -1) {
                    return {
                        image: buffer.slice(index),
                        format,
                        contentType
                    };
                }
            }
        } catch (error) {
            logger.error('Failed to extract image data', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        
        return { image: null, format: null, contentType: null };
    }

    private pruneCache(): void {
        if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
            // Remove oldest entries (first 1000)
            const keysToDelete = Array.from(this.transactionCache.keys()).slice(0, 1000);
            keysToDelete.forEach(key => this.transactionCache.delete(key));
            logger.debug(`Pruned transaction cache, removed ${keysToDelete.length} entries`);
        }
    }

    /**
     * Parse a single transaction
     * @param tx_id Transaction ID to parse
     */
    public async parseTransaction(tx_id: string): Promise<void> {
        // Check cache first
        if (this.transactionCache.has(tx_id)) {
            return;
        }
        
        // Check database with timeout
        try {
            const existingTx = await this.dbClient.get_transaction(tx_id);
            if (existingTx) {
                this.transactionCache.set(tx_id, true);
                this.pruneCache(); // Prune cache if needed
                return;
            }
        } catch (error) {
            logger.warn('Error checking if transaction exists, continuing with processing', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
            // Continue processing even if database check fails
        }

        try {
            if (!tx_id || typeof tx_id !== 'string') {
                logger.error('Invalid transaction ID', { tx_id });
                return;
            }

            logger.info('Parsing transaction', { tx_id });

            // Set timeout for JungleBus transaction fetch
            const timeoutPromise = new Promise<null>((resolve) => {
                setTimeout(() => {
                    logger.warn('Transaction fetch from JungleBus timed out', { tx_id });
                    resolve(null);
                }, 10000); // 10 second timeout
            });

            // Fetch transaction from JungleBus
            const txPromise = this.jungleBus.GetTransaction(tx_id).catch(error => {
                logger.error('Error fetching transaction from JungleBus', {
                    tx_id,
                    error: error instanceof Error ? error.message : String(error)
                });
                return null;
            });

            // Race the fetch against the timeout
            const tx: any = await Promise.race([txPromise, timeoutPromise]);
            
            if (!tx || !tx.transaction) {
                logger.warn('Transaction not found or invalid', { tx_id });
                return;
            }

            // Extract data using BSV library
            const data: string[] = [];
            
            try {
                // Parse the raw transaction using BSV
                try {
                    const rawTx = Buffer.from(tx.transaction, 'base64');
                    const bsvTx = new bsv.Transaction(rawTx);
                    
                    // Process each output
                    for (let i = 0; i < bsvTx.outputs.length; i++) {
                        const output = bsvTx.outputs[i];
                        
                        // Check if this is an OP_RETURN output
                        if (output.script && output.script.isDataOut()) {
                            const chunks = output.script.chunks;
                            
                            // Skip OP_RETURN (first chunk)
                            for (let j = 1; j < chunks.length; j++) {
                                const chunk = chunks[j];
                                if (chunk.buf) {
                                    // Convert buffer to string
                                    try {
                                        const str = sanitizeForDb(chunk.buf.toString('utf8'));
                                        data.push(str);
                                    } catch {
                                        // If UTF-8 conversion fails, try hex
                                        const hex = chunk.buf.toString('hex');
                                        data.push(hex);
                                    }
                                }
                            }
                        }
                    }
                } catch (bsvError) {
                    logger.warn('Failed to parse with BSV library, falling back to raw outputs', {
                        tx_id,
                        error: bsvError instanceof Error ? bsvError.message : String(bsvError)
                    });
                }
                
                // If no data found in OP_RETURN outputs, try to extract from other outputs
                if (data.length === 0) {
                    // Also check the transaction outputs array from JungleBus
                    if (tx.outputs && Array.isArray(tx.outputs)) {
                        for (const output of tx.outputs) {
                            if (typeof output === 'string' && output.length > 0) {
                                // Try to decode the output
                                try {
                                    // Check if it's hex
                                    if (/^[0-9a-fA-F]+$/.test(output)) {
                                        const decoded = decodeHexString(output);
                                        if (decoded) {
                                            // Split by common delimiters
                                            const parts = decoded.split(/[\s\t\n\r\x00-\x1F]+/).filter(Boolean);
                                            data.push(...parts);
                                        }
                                    } else {
                                        // Add as is
                                        data.push(output);
                                    }
                                } catch {
                                    // If decoding fails, add as is
                                    data.push(output);
                                }
                            }
                        }
                    }
                    
                    // Also check data field if available
                    if (tx.data && Array.isArray(tx.data)) {
                        data.push(...tx.data.filter(item => typeof item === 'string'));
                    }
                }
            } catch (error) {
                logger.warn('Failed to parse transaction data, falling back to raw outputs', {
                    tx_id,
                    error: error instanceof Error ? error.message : String(error)
                });
                
                // Fallback to raw outputs
                const outputs = tx.outputs || [];
                if (outputs.length) {
                    for (const output of outputs) {
                        if (typeof output === 'string') {
                            data.push(output);
                        }
                    }
                }
                
                // Also check data field if available
                if (tx.data && Array.isArray(tx.data)) {
                    data.push(...tx.data.filter(item => typeof item === 'string'));
                }
            }

            if (!data.length) {
                logger.warn('No data found in transaction outputs', { tx_id });
                return;
            }

            // Extract Lock protocol data
            const lockData = this.extractLockProtocolData(data, tx);
            if (!lockData) {
                logger.warn('Not a Lock protocol transaction', { tx_id });
                return;
            }

            // Comprehensive log for transaction processing
            logger.debug('Processing transaction data', {
                tx_id,
                dataLength: data.length,
                isLockProtocol: true,
                hasImage: lockData.image_metadata.is_image,
                isVote: lockData.is_vote,
                contentLength: lockData.content?.length || 0,
                tagsCount: lockData.tags?.length || 0
            });

            // Extract tags
            const tags = extractTags(data);
            if (tags.length > 0) {
                lockData.tags = [...(lockData.tags || []), ...tags];
            }

            // Create transaction record
            const txRecord: ParsedTransaction = {
                tx_id,
                block_height: tx.block_height || 0,
                block_time: tx.block_time 
                    ? String(tx.block_time) // Keep as string, dbClient will convert to BigInt
                    : String(Math.floor(Date.now() / 1000)),
                author_address: tx.inputs && tx.inputs[0] ? tx.inputs[0].address : '',
                metadata: lockData
            };

            // Debug log the transaction record
            logger.debug('Saving transaction', {
                tx_id,
                block_time_type: typeof txRecord.block_time,
                block_time: txRecord.block_time
            });

            // Set a timeout for database operation
            const dbTimeoutPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    logger.warn('Database operation timed out', { tx_id });
                    resolve();
                }, 10000); // 10 second timeout
            });

            // Save to database with timeout
            try {
                const savePromise = this.dbClient.save_transaction(txRecord);
                await Promise.race([savePromise, dbTimeoutPromise]);
                logger.info('Transaction saved successfully', { tx_id });
            } catch (dbError) {
                logger.error('Failed to save transaction to database', {
                    tx_id,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
            }
        } catch (error) {
            logger.error('Failed to parse transaction', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        // Add to cache after processing
        this.transactionCache.set(tx_id, true);
        this.pruneCache(); // Prune cache if needed
    }

    /**
     * Parse multiple transactions in batches
     * @param tx_ids Array of transaction IDs to parse
     */
    public async parseTransactions(tx_ids: string[]): Promise<void> {
        // Process in batches of 10
        const batchSize = 10;
        for (let i = 0; i < tx_ids.length; i += batchSize) {
            const batch = tx_ids.slice(i, i + batchSize);
            await Promise.all(batch.map(tx_id => this.parseTransaction(tx_id)));
        }
    }
}