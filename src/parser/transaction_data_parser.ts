/**
 * TransactionDataParser: Responsible for parsing raw transaction data
 */
import bsv from 'bsv';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { JungleBusResponse } from '../shared/types.js';
import { BaseParser } from './base_parser.js';
import { sanitize_for_db, decode_hex_string } from './utils/helpers.js';
import { logger } from '../utils/logger.js';

export class TransactionDataParser extends BaseParser {
    private jungleBus: JungleBusClient;
    // Use the transactionCache from BaseParser

    constructor() {
        super();
        
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            protocol: 'json',
            onError: (ctx) => {
                logger.error("❌ JungleBus Transaction Parser ERROR", ctx);
            }
        });
    }

    /**
     * Fetch raw transaction data from JungleBus
     * @param tx_id Transaction ID to fetch
     * @returns The raw transaction data or null if not found
     */
    public async fetch_transaction(tx_id: string): Promise<JungleBusResponse | null> {
        if (!tx_id || typeof tx_id !== 'string') {
            this.logError('Invalid transaction ID', { tx_id });
            return null;
        }

        // Check if transaction is already in cache
        if (this.transactionCache.has(tx_id)) {
            this.logInfo('Transaction already in cache, skipping fetch', { tx_id });
            return null; // Assume already processed
        }

        this.logInfo('Fetching transaction from JungleBus', { tx_id });

        // Set timeout for JungleBus transaction fetch
        const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
                this.logWarn('Transaction fetch from JungleBus timed out', { tx_id });
                resolve(null);
            }, 10000); // 10 second timeout
        });

        // Fetch transaction from JungleBus
        const txPromise = this.jungleBus.GetTransaction(tx_id).catch(error => {
            this.logError('Error fetching transaction from JungleBus', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        });

        // Race the fetch against the timeout
        const tx: any = await Promise.race([txPromise, timeoutPromise]);
        
        if (!tx || !tx.transaction) {
            this.logWarn('Transaction not found or invalid', { tx_id });
            return null;
        }

        // Add to cache after fetching
        this.transactionCache.set(tx_id, true);
        this.prune_cache(); // Prune cache if needed

        return tx;
    }

    /**
     * Extract data from transaction
     * @param tx The transaction object from JungleBus
     * @returns Array of data strings extracted from OP_RETURN outputs
     */
    public extract_data_from_transaction(tx: JungleBusResponse): string[] {
        const data: string[] = [];
        
        try {
            // Parse the raw transaction using BSV
            try {
                const rawTx = Buffer.from(tx.transaction, 'base64');
                
                // Try to parse the transaction using BSV library
                let bsvTx: bsv.Transaction | null = null;
                
                // Try using the BSV library
                try {
                    bsvTx = new bsv.Transaction(rawTx);
                } catch (bsvError) {
                    this.logWarn('Failed to parse with BSV library, trying alternative methods', {
                        tx_id: tx?.id || 'unknown',
                        error: bsvError instanceof Error ? bsvError.message : String(bsvError)
                    });
                    
                    // Try alternative methods
                    try {
                        // Try with fromBuffer
                        bsvTx = bsv.Transaction.fromBuffer(rawTx);
                    } catch (fromBufferError) {
                        try {
                            // Try with fromHex
                            const rawTxHex = rawTx.toString('hex');
                            bsvTx = bsv.Transaction.fromHex(rawTxHex);
                        } catch (fromHexError) {
                            this.logWarn('All BSV parsing methods failed', {
                                tx_id: tx?.id || 'unknown'
                            });
                        }
                    }
                }
                
                // If we have a valid transaction, process its outputs
                if (bsvTx) {
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
                                    // Process the buffer data
                                    this.processBufferData(chunk.buf, data, tx?.id || 'unknown');
                                }
                            }
                        }
                    }
                }
            } catch (parseError) {
                this.logWarn('Failed to parse transaction with BSV', {
                    tx_id: tx?.id || 'unknown',
                    error: parseError instanceof Error ? parseError.message : String(parseError)
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
                                    const decoded = decode_hex_string(output);
                                    if (decoded) {
                                        this.logDebug('Decoded hex output', {
                                            tx_id: tx?.id || 'unknown',
                                            original_length: output.length,
                                            decoded_preview: decoded.substring(0, 100) + (decoded.length > 100 ? '...' : '')
                                        });
                                        
                                        // Look for key-value pairs in the decoded data
                                        const kvPairs = this.extractKeyValuePairs(decoded);
                                        if (kvPairs.length > 0) {
                                            data.push(...kvPairs);
                                            this.logDebug('Extracted key-value pairs', {
                                                tx_id: tx?.id || 'unknown',
                                                pairs_count: kvPairs.length,
                                                first_few: kvPairs.slice(0, 3)
                                            });
                                        } else {
                                            // If no key-value pairs found, split by common delimiters
                                            const parts = decoded.split(/[\s\t\n\r\x00-\x1F]+/).filter(Boolean);
                                            if (parts.length > 0) {
                                                data.push(...parts);
                                            }
                                        }
                                    }
                                } else {
                                    // Not hex, try to process as-is
                                    data.push(output);
                                }
                            } catch (decodeError) {
                                this.logWarn('Error decoding output', {
                                    tx_id: tx?.id || 'unknown',
                                    error: decodeError instanceof Error ? decodeError.message : String(decodeError)
                                });
                            }
                        }
                    }
                }
            }
            
            // If we still have no data, try to process the raw transaction
            if (data.length === 0 && tx.transaction) {
                try {
                    const rawTx = Buffer.from(tx.transaction, 'base64');
                    const rawTxHex = rawTx.toString('hex');
                    
                    // Try to find OP_RETURN patterns in the raw transaction
                    const opReturnPattern = /6a([0-9a-fA-F]{2,})/g;
                    let match;
                    
                    while ((match = opReturnPattern.exec(rawTxHex)) !== null) {
                        const dataHex = match[1];
                        try {
                            const buf = Buffer.from(dataHex, 'hex');
                            this.processBufferData(buf, data, tx?.id || 'unknown');
                        } catch (bufferError) {
                            this.logWarn('Error processing OP_RETURN data from raw transaction', {
                                tx_id: tx?.id || 'unknown',
                                error: bufferError instanceof Error ? bufferError.message : String(bufferError)
                            });
                        }
                    }
                } catch (rawError) {
                    this.logWarn('Error processing raw transaction data', {
                        tx_id: tx?.id || 'unknown',
                        error: rawError instanceof Error ? rawError.message : String(rawError)
                    });
                }
            }
            
            this.logInfo('Successfully extracted data from transaction', {
                tx_id: tx?.id || 'unknown',
                data_items_count: data.length,
                first_few_items: data.slice(0, 3)
            });
            
            return data;
        } catch (error) {
            this.logError('Error extracting data from transaction', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }
    
    /**
     * Process buffer data and add to data array
     * @param buf Buffer to process
     * @param data Array to add processed data to
     * @param txId Transaction ID for logging
     */
    private processBufferData(buf: Buffer, data: string[], txId: string): void {
        // First check for common binary file signatures
        if (this.isBinaryData(buf)) {
            // For binary data, use hex encoding with a prefix
            const hex = buf.toString('hex');
            data.push(`hex:${hex}`);
            return;
        }
        
        // Try UTF-8 conversion
        try {
            const str = sanitize_for_db(buf.toString('utf8'));
            
            // Check if the string contains invalid characters (often means it wasn't really UTF-8)
            if (str.includes('\ufffd') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
                // If the string has invalid characters, use hex instead
                const hex = buf.toString('hex');
                this.logDebug('Buffer contains invalid UTF-8, using hex', {
                    tx_id: txId,
                    hex_preview: hex.substring(0, 20) + '...'
                });
                data.push(`hex:${hex}`);
            } else {
                // Use the UTF-8 string if it looks valid
                data.push(str);
                
                // Add additional debug logging for specific Lock protocol indicators
                if (str.includes('LOCK') || str.includes('app=lockd.app') || 
                    str.includes('lock_amount=') || str.includes('lock_duration=')) {
                    this.logDebug('Found potential Lock protocol data', {
                        tx_id: txId,
                        data: str.substring(0, 100) + (str.length > 100 ? '...' : '')
                    });
                }
            }
        } catch (strError) {
            // If UTF-8 conversion fails entirely, use hex
            const hex = buf.toString('hex');
            this.logDebug('Error converting buffer to UTF-8, using hex', {
                tx_id: txId,
                error: strError instanceof Error ? strError.message : String(strError),
                hex_preview: hex.substring(0, 20) + '...'
            });
            data.push(`hex:${hex}`);
        }
    }
    
    /**
     * Check if buffer contains binary data
     * @param buf Buffer to check
     * @returns true if buffer contains binary data
     */
    private isBinaryData(buf: Buffer): boolean {
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
     * Process transaction data and extract relevant information
     * @param data Array of data strings extracted from transaction
     * @param tx_id Transaction ID for logging
     * @returns Processed transaction data
     */
    public process_transaction_data(data: string[], tx_id: string): any {
        if (!data || !Array.isArray(data) || data.length === 0) {
            this.logWarn('No data to process', { tx_id });
            return {
                content: '',
                post_id: tx_id,
                is_vote: false,
                tags: []
            };
        }

        this.logInfo('Processing transaction data', { 
            tx_id, 
            data_items_count: data.length,
            first_few: data.slice(0, 3).map(item => 
                typeof item === 'string' ? 
                    (item.length > 50 ? item.substring(0, 50) + '...' : item) : 
                    'non-string item'
            )
        });

        // Initialize result object
        const result: any = {
            content: '',
            post_id: tx_id,
            is_vote: false,
            tags: [],
            lock_amount: 0,
            lock_duration: 0,
            app: '',
            author_name: '',
            media_type: '',
            media_url: '',
            options_hash: '',
            vote_options: [],
            vote_question: ''
        };

        // Track if content has been found in tx.data array
        let contentFromTxData = false;
        
        // Process each data item
        for (const item of data) {
            if (!item || typeof item !== 'string') continue;
            
            // Handle hex-encoded binary data
            if (item.startsWith('hex:')) {
                const hexData = item.substring(4);
                try {
                    // Try to decode hex data - might contain useful information
                    const decoded = Buffer.from(hexData, 'hex').toString('utf8');
                    this.logDebug('Decoded hex data', { 
                        tx_id,
                        decoded_preview: decoded.substring(0, 100) + (decoded.length > 100 ? '...' : '')
                    });
                    
                    // Process the decoded data for key-value pairs
                    this.process_key_value_pairs(decoded, result, contentFromTxData);
                } catch (error) {
                    this.logWarn('Failed to decode hex data', {
                        tx_id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                continue;
            }
            
            // Process regular data item
            this.process_key_value_pairs(item, result, contentFromTxData);
            
            // Check for vote-related keywords
            if (item.includes('vote_question=') || 
                item.includes('vote_options=') || 
                item.includes('options_hash=')) {
                result.is_vote = true;
                this.logDebug('Identified as vote transaction', { tx_id });
            }
            
            // Check for Lock protocol keywords
            if (item.includes('lock_amount=') || 
                item.includes('lock_duration=') || 
                item.includes('app=lockd.app')) {
                this.logDebug('Identified as Lock protocol transaction', { tx_id });
            }
        }
        
        // Clean up and finalize the result
        if (result.tags && Array.isArray(result.tags)) {
            // Remove duplicates and empty tags
            result.tags = [...new Set(result.tags)].filter(Boolean);
        } else {
            result.tags = [];
        }
        
        // Ensure content is a string
        if (!result.content || typeof result.content !== 'string') {
            result.content = '';
        }
        
        // Truncate content if it's too long
        if (result.content.length > 10000) {
            this.logWarn('Content too long, truncating', { 
                tx_id, 
                original_length: result.content.length 
            });
            result.content = result.content.substring(0, 10000);
        }
        
        // Log the processed result
        this.logInfo('Processed transaction data', {
            tx_id,
            content_length: result.content.length,
            is_vote: result.is_vote,
            tags_count: result.tags.length
        });
        
        return result;
    }
    
    /**
     * Process key-value pairs from a data string
     * @param data Data string to process
     * @param result Result object to update
     * @param skipContentUpdate Whether to skip updating content (used when content is from tx.data)
     */
    private process_key_value_pairs(data: string, result: any, skipContentUpdate: boolean = false): void {
        if (!data || typeof data !== 'string') return;
        
        // Check for common key-value pair formats
        const keyValuePairs = this.extractKeyValuePairs(data);
        
        if (keyValuePairs.length > 0) {
            // Process each key-value pair
            for (const pair of keyValuePairs) {
                const [key, value] = pair.split('=').map(part => part.trim());
                if (!key || !value) continue;
                
                // Process specific keys
                switch (key.toLowerCase()) {
                    case 'content':
                        if (!skipContentUpdate) {
                            result.content = value;
                        }
                        break;
                    case 'app':
                        result.app = value;
                        break;
                    case 'tags':
                        // Split tags by common delimiters
                        const tags = value.split(/[,;|]+/).map(tag => tag.trim()).filter(Boolean);
                        if (!result.tags) result.tags = [];
                        result.tags.push(...tags);
                        break;
                    case 'author_name':
                        result.author_name = value;
                        break;
                    case 'lock_amount':
                        result.lock_amount = parseInt(value, 10) || 0;
                        break;
                    case 'lock_duration':
                        result.lock_duration = parseInt(value, 10) || 0;
                        break;
                    case 'media_type':
                        result.media_type = value;
                        break;
                    case 'media_url':
                        result.media_url = value;
                        break;
                    case 'vote_question':
                        result.vote_question = value;
                        result.is_vote = true;
                        break;
                    case 'vote_options':
                        try {
                            // Try to parse as JSON
                            const options = JSON.parse(value);
                            if (Array.isArray(options)) {
                                result.vote_options = options;
                            } else {
                                // If not an array, try to split by common delimiters
                                result.vote_options = value.split(/[,;|]+/).map(opt => opt.trim()).filter(Boolean);
                            }
                        } catch (error) {
                            // If parsing fails, split by common delimiters
                            result.vote_options = value.split(/[,;|]+/).map(opt => opt.trim()).filter(Boolean);
                        }
                        result.is_vote = true;
                        break;
                    case 'options_hash':
                        result.options_hash = value;
                        result.is_vote = true;
                        break;
                    default:
                        // Store other key-value pairs directly
                        const normalizedKey = this.normalizeKey(key);
                        if (normalizedKey) {
                            result[normalizedKey] = value;
                        }
                }
            }
        } else if (!skipContentUpdate && data.trim().length > 0) {
            // If no key-value pairs found and content update is not skipped,
            // use the data as content if it's not already set
            if (!result.content || result.content.length === 0) {
                result.content = data.trim();
            }
        }
    }
    
    /**
     * Extract key-value pairs from a data string
     * @param data Data string to extract key-value pairs from
     * @returns Array of key-value pair strings
     */
    private extractKeyValuePairs(data: string): string[] {
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
     * Check if a transaction is a vote transaction
     * @param parsedData Parsed transaction data
     * @returns True if it's a vote transaction
     */
    public is_vote_transaction(parsedData: any): boolean {
        if (!parsedData) return false;
        
        // Check if is_vote flag is set
        if (parsedData.is_vote === true) return true;
        
        // Check for vote-specific fields
        if (parsedData.vote_question || 
            (parsedData.vote_options && Array.isArray(parsedData.vote_options) && parsedData.vote_options.length > 0) ||
            parsedData.options_hash) {
            return true;
        }
        
        // Check content for vote-related keywords
        if (parsedData.content && typeof parsedData.content === 'string') {
            const content = parsedData.content.toLowerCase();
            if (content.includes('vote') && 
                (content.includes('option') || content.includes('choice') || content.includes('poll'))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get sender address from transaction
     * @param tx The transaction object from JungleBus
     * @returns The sender address or empty string if not found
     */
    public get_sender_address(tx: JungleBusResponse): string {
        try {
            // Get sender address from first input
            return tx.inputs && tx.inputs[0] ? tx.inputs[0].address : '';
        } catch (error) {
            this.logError('Error getting sender address', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
            return '';
        }
    }

    /**
     * Prune the transaction cache if it exceeds the maximum size
     */
    /**
     * Prune the transaction cache if it exceeds the maximum size
     * @deprecated Use the common implementation from BaseParser
     */
    private prune_cache(): void {
        // Call the common implementation from BaseParser
        super.prune_cache(this.transactionCache, this.MAX_CACHE_SIZE);
    }

    /**
     * Extract key-value pairs from decoded string data
     * @param decodedData Decoded string data from transaction
     * @returns Array of key-value strings
     */
    private extractKeyValuePairs(decodedData: string): string[] {
        const result: string[] = [];
        
        try {
            // Pattern for standard key=value pairs
            const keyValuePattern = /([a-zA-Z0-9_]+)=([^\s]+)/g;
            let match;
            
            // Find all key=value pairs in the decoded data
            while ((match = keyValuePattern.exec(decodedData)) !== null) {
                const [fullMatch, key, value] = match;
                if (key && value) {
                    result.push(fullMatch);
                    
                    // Log for debugging
                    this.logDebug('Found key-value pair', { key, value });
                }
            }
            
            // Look for key@value patterns (common in some Lock protocol transactions)
            const keyValueAtPattern = /([a-zA-Z0-9_]+)@([a-zA-Z0-9_\-]+)/g;
            let atMatch;
            
            while ((atMatch = keyValueAtPattern.exec(decodedData)) !== null) {
                const [fullMatch, key, value] = atMatch;
                if (key && value && key.length > 3) { // Avoid very short keys which might be false positives
                    // Convert to standard format
                    const standardFormat = `${key}=${value}`;
                    result.push(standardFormat);
                    
                    // Also add the original format for maximum compatibility
                    result.push(fullMatch);
                    
                    // Log for debugging
                    this.logDebug('Found key@value pair, converted to standard format', { 
                        original: fullMatch, 
                        converted: standardFormat 
                    });
                }
            }
            
            // Also look for specific lock protocol identifiers
            const lockIdentifiers = ['LOCK', 'lock', 'app=lockd.app', 'app=lock'];
            for (const identifier of lockIdentifiers) {
                if (decodedData.includes(identifier)) {
                    result.push(identifier);
                }
            }
            
            // Extract content that's not part of key-value pairs if there's significant text
            // This helps with extracting post content, vote questions, etc.
            const contentPattern = /content=([^\s]+)/;
            const contentMatch = decodedData.match(contentPattern);
            if (contentMatch && contentMatch[1]) {
                // Content is already captured in the key-value pairs above
            } else {
                // Look for longer text chunks that might be content
                const textChunks = decodedData.split(/[\x00-\x1F\s]+/).filter(chunk => 
                    chunk.length > 5 && 
                    !chunk.includes('=') && 
                    !chunk.includes('@') && // Skip potential key@value pairs
                    !/^[0-9a-fA-F]+$/.test(chunk));
                
                if (textChunks.length > 0) {
                    // Find the longest text chunk, which is likely the content
                    const longestChunk = textChunks.reduce((longest, current) => 
                        current.length > longest.length ? current : longest, '');
                    
                    if (longestChunk.length > 0) {
                        // Check if it really looks like content and not structured data
                        const hasWeirdCharacters = /[\{\}\[\]\|\\]/.test(longestChunk);
                        if (!hasWeirdCharacters) {
                            result.push(longestChunk);
                            this.logDebug('Identified potential content', { 
                                content_preview: longestChunk.substring(0, 50) + (longestChunk.length > 50 ? '...' : '') 
                            });
                        }
                    }
                }
            }
            
            // Special handling for options_hash which might be in different formats
            if (decodedData.includes('options_hash') || decodedData.includes('optionsHash')) {
                // This ensures we add options_hash even if it's in a non-standard format
                const optionsHashMatch = decodedData.match(/options_hash[=@]([a-zA-Z0-9_\-]+)/i);
                if (optionsHashMatch && optionsHashMatch[1]) {
                    result.push(`options_hash=${optionsHashMatch[1]}`);
                    this.logDebug('Extracted options_hash with special handling', { 
                        value: optionsHashMatch[1]
                    });
                }
            }
        } catch (error) {
            this.logError('Error extracting key-value pairs', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        return result;
    }
}
