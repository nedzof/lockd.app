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
    private transactionCache = new Map<string, boolean>();

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
                
                // Try different approaches to create the transaction object
                let bsvTx;
                try {
                    // First approach: using direct constructor
                    bsvTx = new bsv.Transaction(rawTx);
                } catch (constructorErr) {
                    try {
                        // Second approach: using fromBuffer
                        bsvTx = bsv.Transaction.fromBuffer(rawTx);
                    } catch (fromBufferErr) {
                        try {
                            // Third approach: using fromHex
                            const rawTxHex = rawTx.toString('hex');
                            bsvTx = bsv.Transaction.fromHex(rawTxHex);
                        } catch (fromHexErr) {
                            // If all approaches fail, rethrow the original error
                            throw constructorErr;
                        }
                    }
                }
                
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
                                    // First try UTF-8 conversion
                                    const str = sanitize_for_db(chunk.buf.toString('utf8'));
                                    
                                    // Check if the string contains invalid characters (often means it wasn't really UTF-8)
                                    if (str.includes('\ufffd') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
                                        // If the string has invalid characters, use hex instead
                                        const hex = chunk.buf.toString('hex');
                                        this.logDebug('OP_RETURN chunk contains invalid UTF-8, using hex', {
                                            tx_id: tx?.id || 'unknown',
                                            hex_preview: hex.substring(0, 20) + '...'
                                        });
                                        data.push(hex);
                                    } else {
                                        // Use the UTF-8 string if it looks valid
                                        data.push(str);
                                        
                                        // Add additional debug logging for specific Lock protocol indicators
                                        if (str.includes('LOCK') || str.includes('app=lockd.app') || 
                                            str.includes('lock_amount=') || str.includes('lock_duration=')) {
                                            this.logDebug('Found potential Lock protocol data in OP_RETURN', {
                                                tx_id: tx?.id || 'unknown',
                                                data: str.substring(0, 100) + (str.length > 100 ? '...' : '')
                                            });
                                        }
                                    }
                                } catch (strError) {
                                    // If UTF-8 conversion fails entirely, use hex
                                    const hex = chunk.buf.toString('hex');
                                    this.logDebug('Error converting OP_RETURN chunk to UTF-8, using hex', {
                                        tx_id: tx?.id || 'unknown',
                                        error: strError instanceof Error ? strError.message : String(strError),
                                        hex_preview: hex.substring(0, 20) + '...'
                                    });
                                    data.push(hex);
                                }
                            }
                        }
                    }
                }
            } catch (bsvError) {
                this.logWarn('Failed to parse with BSV library, falling back to raw outputs', {
                    tx_id: tx?.id || 'unknown',
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
                                            data.push(...parts);
                                        }
                                    }
                                } else {
                                    // Add as is
                                    data.push(output);
                                }
                            } catch (decodeError) {
                                // If decoding fails, add as is
                                this.logWarn('Error decoding hex output', {
                                    tx_id: tx?.id || 'unknown',
                                    error: decodeError instanceof Error ? decodeError.message : String(decodeError),
                                    output_preview: output.substring(0, 50) + (output.length > 50 ? '...' : '')
                                });
                                data.push(output);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.logError('Error extracting data from transaction', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        // Log summary of data extracted
        if (data.length > 0) {
            this.logInfo('Successfully extracted data from transaction', {
                tx_id: tx?.id || 'unknown',
                data_items_count: data.length,
                first_few_items: data.slice(0, 3).map(item => 
                    typeof item === 'string' ? 
                        (item.length > 50 ? item.substring(0, 50) + '...' : item) : 
                        'non-string item')
            });
        } else {
            this.logWarn('No data extracted from transaction', { tx_id: tx?.id || 'unknown' });
        }
        
        return data;
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
    private prune_cache(): void {
        if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
            // Convert to array of keys
            const keys = Array.from(this.transactionCache.keys());
            
            // Remove oldest entries (first 20% of the cache)
            const pruneCount = Math.floor(this.MAX_CACHE_SIZE * 0.2);
            const keysToRemove = keys.slice(0, pruneCount);
            
            for (const key of keysToRemove) {
                this.transactionCache.delete(key);
            }
            
            this.logInfo('Pruned transaction cache', {
                pruned: pruneCount,
                remaining: this.transactionCache.size
            });
        }
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
