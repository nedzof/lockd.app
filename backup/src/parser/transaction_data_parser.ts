/**
 * TransactionDataParser: Responsible for parsing raw transaction data
 * 
 * This class handles the following responsibilities:
 * 1. Fetching transactions from JungleBus API
 * 2. Parsing and processing raw transaction data
 * 3. Extracting meaningful content from transactions including specialized content types
 * 4. Processing binary data in transactions
 * 5. Detecting transaction types based on content
 * 6. Extracting metadata from transaction content
 * 
 * This class now incorporates the functionality previously divided between
 * TransactionDataParser for more cohesive transaction processing.
 */
import bsv from 'bsv';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { JungleBusResponse } from '../shared/types.js';
import { BaseParser } from './base_parser.js';
import { MediaParser } from './media_parser.js';
import { 
    sanitize_for_db, 
    decode_hex_string, 
    is_binary_data, 
    extract_key_value_pairs, 
    process_buffer_data,
    normalize_key
} from './utils/helpers.js';
import { logger } from '../utils/logger.js';
import { VoteParser } from './vote_parser.js';

export class TransactionDataParser extends BaseParser {
    private mediaParser: MediaParser;
    

    private jungleBus: JungleBusClient;
    private voteParser: VoteParser;
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
        
        this.voteParser = new VoteParser();
        this.mediaParser = new MediaParser();
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
                            // First, check for the special cordQ+image/gif+PNG pattern directly in the script buffer
                            if (output.script.toBuffer) {
                                try {
                                    const scriptBuf = output.script.toBuffer();
                                    const scriptStr = scriptBuf.toString('utf8', 0, Math.min(scriptBuf.length, 200));
                                    
                                    // Check for cordQ + image/gif pattern
                                    if (scriptStr.includes('cordQ') && scriptStr.includes('image/gif')) {
                                        this.logInfo('Found cordQ + image/gif pattern in script buffer', {
                                            tx_id: tx?.id || 'unknown'
                                        });
                                        
                                        // Get the position of image/gif
                                        const gifIndex = scriptStr.indexOf('image/gif');
                                        if (gifIndex >= 0 && gifIndex + 9 < scriptBuf.length) {
                                            // Extract the data after image/gif
                                            const afterGifBuffer = scriptBuf.slice(gifIndex + 9);
                                            
                                            // Check if this data has a PNG signature
                                            if (afterGifBuffer.length >= 8 && 
                                                afterGifBuffer[0] === 0x89 && afterGifBuffer[1] === 0x50 && 
                                                afterGifBuffer[2] === 0x4E && afterGifBuffer[3] === 0x47 && 
                                                afterGifBuffer[4] === 0x0D && afterGifBuffer[5] === 0x0A && 
                                                afterGifBuffer[6] === 0x1A && afterGifBuffer[7] === 0x0A) {
                                                
                                                this.logInfo('🖼️ Found PNG signature after image/gif in script buffer', {
                                                    tx_id: tx?.id || 'unknown'
                                                });
                                                
                                                // Add the correct content type
                                                data.push('image/png');
                                                data.push(`raw_image_data:${afterGifBuffer.toString('hex')}`);
                                                return data; // Return early as we've found what we're looking for
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Ignore errors in PNG detection
                                }
                            }
                            
                            const chunks = output.script.chunks;
                            
                            // Skip OP_RETURN (first chunk)
                            for (let j = 1; j < chunks.length; j++) {
                                const chunk = chunks[j];
                                if (chunk.buf) {
                                    // Special handling for cordQ pattern with image/gif that we observed
                                    try {
                                        const chunkStr = chunk.buf.toString('utf8');
                                        if (chunkStr.includes('cordQ') && chunkStr.includes('image/gif')) {
                                            this.logInfo('🎬 Found cordQ + image/gif pattern in chunk', {
                                                tx_id: tx?.id || 'unknown',
                                                chunk_index: j
                                            });
                                            
                                            // Add 'image/gif' as a separate item for better detection
                                            data.push('image/gif');
                                            
                                            // Try to extract binary data that might follow image/gif
                                            const gifIndex = chunkStr.indexOf('image/gif');
                                            if (gifIndex >= 0 && gifIndex + 9 < chunkStr.length) {
                                                // Extract the data after 'image/gif'
                                                const rawData = chunkStr.substring(gifIndex + 9);
                                                if (rawData.length > 0) {
                                                    const binaryData = Buffer.from(rawData);
                                                    this.logInfo('📷 Extracted raw image data after image/gif', {
                                                        tx_id: tx?.id || 'unknown',
                                                        data_length: binaryData.length
                                                    });
                                                    
                                                    // Check if this data actually has a PNG signature despite being labeled as GIF
                                                    if (binaryData.length >= 8 &&
                                                        binaryData[0] === 0x89 && binaryData[1] === 0x50 && 
                                                        binaryData[2] === 0x4E && binaryData[3] === 0x47 &&
                                                        binaryData[4] === 0x0D && binaryData[5] === 0x0A && 
                                                        binaryData[6] === 0x1A && binaryData[7] === 0x0A) {
                                                        
                                                        this.logInfo('🖼️ Detected PNG signature in data labeled as image/gif - correcting', {
                                                            tx_id: tx?.id || 'unknown'
                                                        });
                                                        
                                                        // Override the previously added 'image/gif' with 'image/png'
                                                        data.pop(); // Remove the last added 'image/gif'
                                                        data.push('image/png'); // Add correct content type
                                                        data.push(`raw_image_data:${binaryData.toString('hex')}`);
                                                        return; // Exit early as we've handled this chunk
                                                    } else {
                                                        // It's actually GIF data or some other format
                                                        data.push(`raw_image_data:${binaryData.toString('hex')}`);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // Ignore errors in special handling and continue with normal processing
                                    }
                                    
                                    // Process the buffer data with the regular method
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
            
            // Always process the raw transaction for image data regardless of other results
            if (tx.transaction) {
                try {
                    // Get the raw transaction buffer
                    const rawTx = Buffer.from(tx.transaction, 'base64');
                    
                    // Directly search for image signatures in the entire transaction
                    this.extractImageSignatures(rawTx, data, tx?.id || 'unknown');
                    
                    // Also try to find OP_RETURN patterns in the raw transaction
                    const rawTxHex = rawTx.toString('hex');
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
     * Directly extract image signatures from a buffer and add them to the data array
     * @param buf Buffer to process
     * @param data Array to add processed data to
     * @param txId Transaction ID for logging
     */
    private extractImageSignatures(buf: Buffer, data: string[], txId: string): void {
        if (!buf || buf.length === 0) return;
        
        // Scan the entire buffer for PNG signatures
        let pngIndex = -1;
        for (let i = 0; i < buf.length - 8; i++) {
            if (buf[i] === 0x89 && buf[i+1] === 0x50 && buf[i+2] === 0x4E && buf[i+3] === 0x47 &&
                buf[i+4] === 0x0D && buf[i+5] === 0x0A && buf[i+6] === 0x1A && buf[i+7] === 0x0A) {
                pngIndex = i;
                this.logInfo(`🖼️ Found PNG signature at position ${pngIndex} in raw transaction`, { txId });
                
                // Extract the PNG data starting from the signature
                const pngData = buf.slice(pngIndex);
                data.push('image/png');
                data.push(`raw_image_data:${pngData.toString('hex')}`);
                return; // Found high-priority PNG signature
            }
        }
        
        // Scan for GIF signatures if no PNG was found
        let gifIndex = -1;
        for (let i = 0; i < buf.length - 6; i++) {
            if (buf[i] === 0x47 && buf[i+1] === 0x49 && buf[i+2] === 0x46 && buf[i+3] === 0x38 &&
                (buf[i+4] === 0x39 || buf[i+4] === 0x37) && buf[i+5] === 0x61) {
                gifIndex = i;
                this.logInfo(`🎬 Found GIF signature at position ${gifIndex} in raw transaction`, { txId });
                
                // Extract the GIF data starting from the signature
                const gifData = buf.slice(gifIndex);
                data.push('image/gif');
                data.push(`raw_image_data:${gifData.toString('hex')}`);
                return;
            }
        }
    }
    
    /**
     * Process buffer data and add to data array
     * @param buf Buffer to process
     * @param data Array to add processed data to
     * @param txId Transaction ID for logging
     */
    private processBufferData(buf: Buffer, data: string[], txId: string): void {
        // Skip empty buffers
        if (!buf || buf.length === 0) {
            return;
        }

        // Check for common image signatures directly in the buffer
        // PNG signature check (89 50 4E 47 0D 0A 1A 0A) - most reliable
        let pngIndex = -1;
        for (let i = 0; i < buf.length - 8; i++) {
            if (buf[i] === 0x89 && buf[i+1] === 0x50 && buf[i+2] === 0x4E && buf[i+3] === 0x47 &&
                buf[i+4] === 0x0D && buf[i+5] === 0x0A && buf[i+6] === 0x1A && buf[i+7] === 0x0A) {
                pngIndex = i;
                break;
            }
        }

        if (pngIndex >= 0) {
            this.logInfo(`🖼️ Found PNG signature at position ${pngIndex} in buffer`, { txId });
            
            // Extract the PNG data starting from the signature
            const pngData = buf.slice(pngIndex);
            data.push('image/png');
            data.push(`raw_image_data:${pngData.toString('hex')}`);
            return;
        }
        
        // GIF signature check (47 49 46 38)
        let gifIndex = -1;
        for (let i = 0; i < buf.length - 6; i++) {
            if (buf[i] === 0x47 && buf[i+1] === 0x49 && buf[i+2] === 0x46 && buf[i+3] === 0x38 &&
                (buf[i+4] === 0x39 || buf[i+4] === 0x37) && buf[i+5] === 0x61) {
                gifIndex = i;
                break;
            }
        }
        
        if (gifIndex >= 0) {
            this.logInfo(`🎬 Found GIF signature at position ${gifIndex} in buffer`, { txId });
            
            // Extract the GIF data starting from the signature
            const gifData = buf.slice(gifIndex);
            data.push('image/gif');
            data.push(`raw_image_data:${gifData.toString('hex')}`);
            return;
        }
        
        // If no file signature was found, check for content type identifiers
        try {
            const str = buf.toString('utf8');
            
            // Look for the cordQ pattern which often precedes content types
            if (str.includes('cordQ')) {
                this.logInfo('💼 Found cordQ marker, checking for content types', { txId });
                
                // Extract content type that follows cordQ
                const cordQIndex = str.indexOf('cordQ');
                if (cordQIndex >= 0 && cordQIndex + 5 < str.length) {
                    // Extract the part after 'cordQ' which often contains the content type
                    const afterCordQ = str.substring(cordQIndex + 5);
                    
                    // Check for image/gif content type specifically
                    if (afterCordQ.includes('image/gif')) {
                        this.logInfo('🎬 Found image/gif after cordQ marker', { txId });
                        data.push('image/gif');
                        
                        // Also try to extract the raw image data that follows
                        const gifIndex = afterCordQ.indexOf('image/gif');
                        if (gifIndex >= 0 && gifIndex + 9 < afterCordQ.length) {
                            const potentialImageData = afterCordQ.substring(gifIndex + 9);
                            if (potentialImageData && potentialImageData.length > 0) {
                                this.logInfo('📷 Found potential raw image data after image/gif', { txId });
                                data.push(`raw_image_data:${Buffer.from(potentialImageData).toString('hex')}`);
                            }
                        }
                    }
                    // Check for other mime types
                    else if (afterCordQ.includes('image/png')) {
                        this.logInfo('📷 Found image/png after cordQ marker', { txId });
                        data.push('image/png');
                    }
                    else if (afterCordQ.includes('image/jpeg')) {
                        this.logInfo('📷 Found image/jpeg after cordQ marker', { txId });
                        data.push('image/jpeg');
                    }
                }
            }
            
            // Direct content type checks in the buffer
            if (str === 'image/gif') {
                this.logInfo('🎬 Found exact image/gif content type in buffer', { txId });
                data.push('image/gif');
            } else if (str.includes('image/gif') && !str.includes('cordQ')) {
                // Only add if we didn't already add it from the cordQ check
                this.logInfo('🎬 Found image/gif reference in buffer data', { txId });
                data.push('image/gif');
            }
            
            // Also check for mime type patterns like "content_type=image/gif"
            if (str.includes('content_type=image/gif') || str.includes('Content-Type: image/gif')) {
                this.logInfo('🎬 Found image/gif content type metadata', { txId });
                data.push('image/gif');
            }
        } catch (error) {
            // Non-text buffer, ignore this check
        }
        
        // Use the helper function to process buffer data
        const processedData = process_buffer_data(buf, txId);
        data.push(processedData);
        
        // Add additional debug logging for specific Lock protocol indicators
        if (processedData.includes('LOCK') || processedData.includes('app=lockd.app') || 
            processedData.includes('lock_amount=') || processedData.includes('lock_duration=')) {
            this.logDebug('Found potential Lock protocol data', {
                tx_id: txId,
                data: processedData.substring(0, 100) + (processedData.length > 100 ? '...' : '')
            });
        }
    }
    
    // The isBinaryData method has been removed in favor of the is_binary_data helper function

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
        
        // First, scan for content types and raw image data in the data array
        let gifContentTypeFound = false;
        let rawImageDataItem: string | null = null;
        
        // Find GIF content type and raw image data
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item || typeof item !== 'string') continue;
            
            // Check for GIF content type
            if (item === 'image/gif') {
                this.logInfo('🎬 Found image/gif content type in data array', { tx_id, index: i });
                gifContentTypeFound = true;
                result.media_type = 'gif';
                result.content_type = 'image/gif';
                result.is_binary = true;
            }
            
            // Check for raw image data specially marked by our enhanced processBufferData method
            if (item.startsWith('raw_image_data:')) {
                this.logInfo('📷 Found raw image data item in data array', { tx_id, index: i });
                rawImageDataItem = item;
                result.has_raw_image_data = true;
            }
        }
        
        // Check for PNG content type
        let pngContentTypeFound = false;
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item || typeof item !== 'string') continue;
            
            if (item === 'image/png') {
                this.logInfo('🖼️ Found image/png content type in data array', { tx_id, index: i });
                pngContentTypeFound = true;
                result.media_type = 'png';
                result.content_type = 'image/png';
                result.is_binary = true;
            }
        }
        
        // Process raw image data if content type was found (GIF or PNG)
        if ((gifContentTypeFound || pngContentTypeFound) && rawImageDataItem) {
            // Extract hex data from our marked raw_image_data item
            const hexData = rawImageDataItem.substring('raw_image_data:'.length);
            if (hexData && hexData.length > 0) {
                result.raw_image_data = hexData;
                
                // Verify the actual data signature to ensure we have correct media_type
                const dataBuffer = Buffer.from(hexData, 'hex');
                
                // Check buffer for PNG signature regardless of declared content type
                if (dataBuffer.length >= 8 && 
                    dataBuffer[0] === 0x89 && dataBuffer[1] === 0x50 && 
                    dataBuffer[2] === 0x4E && dataBuffer[3] === 0x47 && 
                    dataBuffer[4] === 0x0D && dataBuffer[5] === 0x0A && 
                    dataBuffer[6] === 0x1A && dataBuffer[7] === 0x0A) {
                    
                    // It's actually a PNG even if labeled as GIF
                    if (gifContentTypeFound && !pngContentTypeFound) {
                        this.logInfo('🖼️ Correcting misidentified GIF to PNG based on signature', { tx_id });
                    }
                    
                    result.media_type = 'png';
                    result.content_type = 'image/png';
                }
                
                // Check buffer for GIF signature as a fallback
                else if (dataBuffer.length >= 6 && 
                         dataBuffer[0] === 0x47 && dataBuffer[1] === 0x49 && 
                         dataBuffer[2] === 0x46 && dataBuffer[3] === 0x38) {
                    result.media_type = 'gif';
                    result.content_type = 'image/gif';
                }
                // Update log message to reflect the actual content type detected
                const detectedType = (result.content_type === 'image/png') ? 'PNG' : 'GIF';
                this.logInfo(`💾 Successfully extracted raw image data for ${detectedType}`, { 
                    tx_id, 
                    data_size: hexData.length / 2, // Since each byte is 2 hex chars
                    content_type: result.content_type
                });
                
                // Add image metadata
                result.image_metadata = { 
                    format: 'gif', 
                    size: hexData.length / 2 
                };
                
                // Process with MediaParser to get additional metadata if possible
                try {
                    const mediaParser = new MediaParser();
                    const metadata = mediaParser.process_image('image/gif', hexData);
                    if (metadata) {
                        result.image_metadata = metadata;
                        this.logInfo('💼 Enhanced image metadata using MediaParser', { tx_id });
                    }
                } catch (error) {
                    this.logWarn('Error processing GIF with MediaParser', {
                        tx_id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        
        // If we still don't have raw image data but we found GIF content type, look for it in adjacent items
        if (gifContentTypeFound && !result.raw_image_data) {
            const gifContentTypeIndex = data.findIndex(item => item === 'image/gif');
            if (gifContentTypeIndex >= 0 && gifContentTypeIndex < data.length - 1) {
                const potentialImageData = data[gifContentTypeIndex + 1];
                if (potentialImageData && typeof potentialImageData === 'string') {
                    // If it's already hex-encoded, use it directly
                    if (potentialImageData.startsWith('hex:')) {
                        result.raw_image_data = potentialImageData.substring(4);
                        this.logInfo('💾 Found hex-encoded GIF data after content type', { tx_id });
                    } else {
                        // Try to treat it as binary data
                        try {
                            const buffer = Buffer.from(potentialImageData, 'utf8');
                            result.raw_image_data = buffer.toString('hex');
                            this.logInfo('💾 Converted potential GIF data to hex', { tx_id });
                        } catch (error) {
                            this.logWarn('Error processing potential GIF data', {
                                tx_id,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        }
                    }
                }
            }
        }
        
        // Process each data item
        for (const item of data) {
            if (!item || typeof item !== 'string') continue;
            
            // Handle hex-encoded binary data
            if (item.startsWith('hex:')) {
                // Check if it has content type metadata (added by process_buffer_data)
                let hexData = '';
                let contentType = '';
                
                if (item.includes('|content_type=')) {
                    // Format: hex:<hexdata>|content_type=<mimetype>
                    const parts = item.split('|content_type=');
                    hexData = parts[0].substring(4); // Remove 'hex:' prefix
                    contentType = parts[1];
                    
                    this.logInfo('Found binary data with content type', { 
                        tx_id,
                        content_type: contentType,
                        data_size: hexData.length / 2 // Since each byte is 2 hex chars
                    });
                    
                    // Set media type and content type in the result
                    result.media_type = contentType;
                    result.content_type = contentType;
                    
                    // If this is an image, mark it as binary content
                    if (contentType.startsWith('image/')) {
                        result.content = `Binary image data (${contentType})`;
                        result.raw_image_data = hexData;
                        
                        // Handle specific image types
                        if (contentType === 'image/gif') {
                            this.logInfo('Processing GIF image data', { tx_id });
                            result.image_metadata = { format: 'gif', size: hexData.length / 2 };
                        } else if (contentType === 'image/png') {
                            result.image_metadata = { format: 'png', size: hexData.length / 2 };
                        } else if (contentType === 'image/jpeg') {
                            result.image_metadata = { format: 'jpeg', size: hexData.length / 2 };
                        }
                        
                        // If we have binary content, we'll skip extracting text content from it
                        contentFromTxData = true;
                        continue;
                    }
                } else {
                    // Regular hex data without content type
                    hexData = item.substring(4);
                }
                
                try {
                    // Try to decode hex data - might contain useful information if it's not binary
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
                item.includes('options_hash=') ||
                item.includes('is_vote=true') ||
                item.includes('type=vote')) {
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
        
        // Add binary detection flag if binary content is detected
        if (this.detectBinaryContent(result.content) || 
            (result.media_type && result.media_type.startsWith('image/')) || 
            (result.content_type && result.content_type.startsWith('image/'))) {
            result.is_binary = true;
            
            // Make sure content type is set if we have media type
            if (!result.content_type && result.media_type) {
                result.content_type = result.media_type;
            }
            
            // Make sure media type is set if we have content type
            if (!result.media_type && result.content_type) {
                result.media_type = result.content_type;
            }
            
            // Ensure raw_image_data exists when we have image content
            if (result.raw_image_data) {
                // Ensure image_metadata is properly set
                if (!result.image_metadata) {
                    const format = result.media_type.split('/')[1] || 'unknown';
                    result.image_metadata = {
                        format,
                        size: result.raw_image_data.length / 2
                    };
                }
                
                // Special handling for GIF images using MediaParser
                if (result.media_type === 'image/gif' || result.content_type === 'image/gif') {
                    this.logInfo('🎬 Delegating GIF processing to MediaParser', { tx_id });
                    try {
                        // Make sure raw_image_data exists before trying to process it
                        if (!result.raw_image_data) {
                            this.logWarn('No raw image data found for GIF processing', { tx_id });
                            result.image_metadata = { format: 'gif', error: 'No raw image data available' };
                        } else {
                            // Ensure we have a proper Buffer for MediaParser
                            let gifBuffer;
                            if (typeof result.raw_image_data === 'string') {
                                // Convert hex string to buffer
                                gifBuffer = Buffer.from(result.raw_image_data, 'hex');
                            } else if (Buffer.isBuffer(result.raw_image_data)) {
                                gifBuffer = result.raw_image_data;
                            } else {
                                this.logWarn('Invalid raw_image_data format for GIF processing', { 
                                    tx_id,
                                    type: typeof result.raw_image_data
                                });
                                gifBuffer = null;
                            }
                            
                            if (gifBuffer) {
                                // Process GIF with the MediaParser
                                const { metadata } = this.mediaParser.process_gif_image(gifBuffer, tx_id);
                                
                                // Update metadata with enhanced information
                                result.image_metadata = {
                                    ...result.image_metadata,
                                    ...metadata
                                };
                                
                                this.logInfo('✅ Successfully processed GIF with MediaParser', {
                                    tx_id,
                                    width: metadata.width,
                                    height: metadata.height,
                                    is_animated: metadata.is_animated
                                });
                            }
                        }
                    } catch (error) {
                        this.logWarn('Error in GIF processing, using basic metadata', {
                            tx_id,
                            error: error instanceof Error ? error.message : String(error)
                        });
                        // Ensure GIF-specific metadata is properly set at minimum
                        if (!result.image_metadata || !result.image_metadata.format || result.image_metadata.format !== 'gif') {
                            result.image_metadata = { 
                                ...(result.image_metadata || {}),
                                format: 'gif',
                                error_message: error instanceof Error ? error.message : String(error)
                            };
                        }
                    }
                }
            }
        } else {
            // Check for hex-encoded content that might be binary
            if (result.content && typeof result.content === 'string' && result.content.startsWith('hex:')) {
                result.is_binary = true;
                
                // Try to determine binary type from the content
                try {
                    const hexPart = result.content.substring(4).split('|')[0]; // Remove 'hex:' prefix
                    const buffer = Buffer.from(hexPart.substring(0, 50), 'hex');
                    
                    // Check file signatures
                    if (buffer.length >= 4) {
                        let detectedType = null;
                        
                        // GIF signature: 47 49 46 38 (GIF8)
                        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
                            detectedType = 'image/gif';
                            this.logInfo('🎬 Detected GIF image from hex content', { tx_id });
                            
                            // Process with MediaParser for better GIF handling
                            try {
                                const fullBuffer = Buffer.from(hexPart, 'hex');
                                const { metadata } = this.mediaParser.process_gif_image(fullBuffer, tx_id);
                                result.image_metadata = metadata;
                            } catch (error) {
                                this.logWarn('Error in GIF processing from hex content, using basic detection', {
                                    tx_id,
                                    error: error instanceof Error ? error.message : String(error)
                                });
                            }
                        }
                        // PNG signature: 89 50 4E 47
                        else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                            detectedType = 'image/png';
                        }
                        // JPEG signature: FF D8 FF
                        else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                            detectedType = 'image/jpeg';
                        }
                        
                        if (detectedType) {
                            result.content_type = detectedType;
                            result.media_type = detectedType;
                            result.raw_image_data = hexPart;
                            result.image_metadata = {
                                format: detectedType.split('/')[1],
                                size: hexPart.length / 2
                            };
                        }
                    }
                } catch (error) {
                    this.logWarn('Error analyzing potential binary content', {
                        tx_id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        
        // Log the processed result
        this.logInfo('Processed transaction data', {
            tx_id,
            content_length: result.content ? result.content.length : 0,
            is_binary: result.is_binary || false,
            content_type: result.content_type || '',
            media_type: result.media_type || '',
            has_raw_image_data: !!result.raw_image_data,
            is_vote: result.is_vote,
            tags_count: result.tags.length
        });
        
        return result;
    }
    
    /**
     * Detects if content is likely binary data
     * 
     * This method uses multiple strategies to identify binary data:
     * 1. Checks for hex: prefix indicating hex-encoded binary data
     * 2. Examines content for binary signatures (GIF, PNG, JPEG, etc.)
     * 3. Performs statistical analysis to identify non-text content
     * 
     * @param content The content to analyze
     * @returns True if the content appears to be binary data
     */
    public detectBinaryContent(content: string | null | undefined): boolean {
        if (!content) return false;
        
        // Check if it's already encoded as hex
        if (content.startsWith('hex:')) {
            return true;
        }
        
        // Check for binary file signatures in the first few bytes if this might be raw binary data
        try {
            // For very short strings, this might be a base64 or hex representation of binary data
            if (content.length > 5 && content.length < 10000) {
                // Test if it's a valid hex string
                if (/^[0-9a-fA-F]+$/.test(content)) {
                    // Try to decode it and check for file signatures
                    try {
                        const buffer = Buffer.from(content, 'hex');
                        
                        // Check common file signatures
                        if (buffer.length >= 4) {
                            // GIF signature: 47 49 46 38 (GIF8)
                            if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
                                this.logInfo('🎬 Detected hex-encoded GIF image');
                                return true;
                            }
                            // PNG signature: 89 50 4E 47
                            else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                                return true;
                            }
                            // JPEG signature: FF D8 FF
                            else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                                return true;
                            }
                        }
                    } catch (e) {
                        // Not valid hex data, continue with other checks
                    }
                }
                
                // Test if it's a valid base64 string
                if (/^[A-Za-z0-9+/=]+$/.test(content)) {
                    // Try to decode it and check for file signatures
                    try {
                        const buffer = Buffer.from(content, 'base64');
                        
                        // Check common file signatures
                        if (buffer.length >= 4) {
                            // GIF signature
                            if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
                                this.logInfo('🎬 Detected base64-encoded GIF image');
                                return true;
                            }
                            // PNG signature
                            else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                                return true;
                            }
                            // JPEG signature
                            else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                                return true;
                            }
                        }
                    } catch (e) {
                        // Not valid base64 data, continue with other checks
                    }
                }
            }
            
            // Statistical analysis of content to detect binary data
            // Binary data typically has a high proportion of non-printable characters
            const contentSample = content.substring(0, Math.min(1000, content.length));
            let nonTextCount = 0;
            
            for (let i = 0; i < contentSample.length; i++) {
                const code = contentSample.charCodeAt(i);
                
                // Count characters outside common text ranges
                // ASCII printable range (32-126) plus common whitespace (9-13) plus UTF-8 above 127
                if ((code < 9 || (code > 13 && code < 32) || (code > 126 && code < 160))) {
                    nonTextCount++;
                }
            }
            
            // If more than 15% non-text characters, likely binary
            const nonTextRatio = nonTextCount / contentSample.length;
            if (nonTextRatio > 0.15) {
                this.logDebug('Detected probable binary content through statistical analysis', {
                    sample_length: contentSample.length,
                    non_text_ratio: nonTextRatio
                });
                return true;
            }
        } catch (error) {
            this.logWarn('Error in binary content detection', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        return false;
    }
    
    /**
     * Process key-value pairs from a data string
     * @param data Data string to process
     * @param result Result object to update
     * @param skipContentUpdate Whether to skip updating content (used when content is from tx.data)
     */
    private process_key_value_pairs(data: string, result: any, skipContentUpdate: boolean = false): void {
        if (!data || typeof data !== 'string') return;
        
        // Extract key-value pairs with Lock protocol specific processing
        const keyValuePairs = this.extractLockProtocolKeyValuePairs(data);
        
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
                        const normalizedKey = normalize_key(key);
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
        // Use the helper function to extract key-value pairs
        return extract_key_value_pairs(data);
    }
    
    /**
     * Check if a transaction is a vote transaction
     * @param parsedData Parsed transaction data or raw transaction data array
     * @returns True if it's a vote transaction
     */
    public is_vote_transaction(parsedData: any): boolean {
        if (!parsedData) return false;
        
        // If it's an array of strings, delegate to VoteParser
        if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'string') {
            return this.voteParser.is_vote_transaction(parsedData);
        }
        
        // For parsed objects, use standardized detection
        // Check if is_vote flag is set
        if (parsedData.is_vote === true) return true;
        
        // Check for vote-specific fields
        if (parsedData.vote_question || 
            (parsedData.vote_options && Array.isArray(parsedData.vote_options) && parsedData.vote_options.length > 0) ||
            parsedData.options_hash) {
            this.logDebug('Detected vote transaction from vote-specific fields');
            return true;
        }
        
        // For content string, convert to format VoteParser can check
        if (parsedData.content && typeof parsedData.content === 'string') {
            // Create a simple array with content field for VoteParser to check
            return this.voteParser.is_vote_transaction([`content=${parsedData.content}`]);
        }
        
        return false;
    }

    /**
     * Extract content from transaction with specific extraction based on content type
     * 
     * This method handles specialized content extraction including:
     * 1. Detecting content type (text, media, structured data)
     * 2. Applying appropriate extraction logic based on content type
     * 3. Normalizing extracted content for consistent processing
     * 
     * @param txData Transaction data array to extract content from
     * @param txId Transaction ID for logging
     * @returns Extracted and normalized content based on type
     */
    public extract_specialized_content(txData: string[], txId: string): {
        content: string;
        content_type: string;
        raw_image_data?: string;
        media_type?: string;
        image_metadata?: Record<string, any>;
        metadata: Record<string, any>;
    } {
        try {
            this.logDebug('Extracting specialized content', { txId, data_length: txData.length });
            
            // Default result structure with enhanced fields for binary content
            const result = {
                content: '',
                content_type: 'text',
                raw_image_data: undefined,
                media_type: undefined,
                image_metadata: undefined,
                metadata: {}
            };
            
            // Check for binary content first
            const binaryItems = txData.filter(item => item.startsWith('hex:'));
            if (binaryItems.length > 0) {
                // Process the first binary item
                const firstBinaryItem = binaryItems[0];
                let hexData = '';
                let contentType = 'binary'; // Default content type
                
                // Check if it includes content type metadata
                if (firstBinaryItem.includes('|content_type=')) {
                    // Format: hex:<hexdata>|content_type=<mimetype>
                    const parts = firstBinaryItem.split('|content_type=');
                    hexData = parts[0].substring(4); // Remove 'hex:' prefix
                    contentType = parts[1];
                    
                    this.logInfo('Found binary data with explicit content type', { 
                        txId,
                        content_type: contentType,
                        data_size: hexData.length / 2 // Since each byte is 2 hex chars
                    });
                    
                    // For GIF images, add special handling
                    if (contentType === 'image/gif') {
                        this.logInfo('🎨 Processing GIF image data from content-type metadata', { txId });
                        result.content = `Binary image data (${contentType})`;
                        result.content_type = contentType;
                        result.media_type = contentType;
                        result.raw_image_data = hexData;
                        
                        // Create buffer from hex data for MediaParser
                        const gifBuffer = Buffer.from(hexData, 'hex');
                        
                        // Use MediaParser for enhanced GIF processing
                        try {
                            const { metadata } = this.mediaParser.process_gif_image(gifBuffer, txId);
                            result.image_metadata = metadata;
                            this.logInfo('🎬 Successfully processed GIF with MediaParser', {
                                txId,
                                width: metadata.width,
                                height: metadata.height,
                                is_animated: metadata.is_animated
                            });
                        } catch (error) {
                            this.logWarn('Error in GIF processing from content-type metadata, using basic metadata', {
                                txId,
                                error: error instanceof Error ? error.message : String(error)
                            });
                            result.image_metadata = { format: 'gif', size: hexData.length / 2 };
                        }
                        
                        result.metadata = {
                            ...result.metadata,
                            raw_image_data: hexData,
                            image_metadata: result.image_metadata,
                            binary_items_count: binaryItems.length,
                            media_type: contentType,
                            content_type: contentType
                        };
                        return result;
                    }
                } else {
                    // Regular hex data without content type
                    hexData = firstBinaryItem.substring(4);
                    
                    // Try to determine binary type via file signature
                    try {
                        const buffer = Buffer.from(hexData.substring(0, 50), 'hex');
                        // Check for common file signatures
                        if (buffer.length >= 4) {
                            // PNG signature: 89 50 4E 47
                            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                                contentType = 'image/png';
                            } 
                            // JPEG signature: FF D8 FF
                            else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                                contentType = 'image/jpeg';
                            }
                            // GIF signature: 47 49 46 38 (GIF8)
                            else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
                                contentType = 'image/gif';
                                this.logInfo('🎬 Detected GIF image from file signature', { txId });
                                
                                // Try to process the full GIF with MediaParser right away
                                try {
                                    const fullBuffer = Buffer.from(hexData, 'hex');
                                    const { metadata } = this.mediaParser.process_gif_image(fullBuffer, txId);
                                    // Store the metadata for later use
                                    result.image_metadata = metadata;
                                    this.logInfo('🎬 Successfully processed GIF with MediaParser', {
                                        txId,
                                        width: metadata.width,
                                        height: metadata.height,
                                        is_animated: metadata.is_animated
                                    });
                                } catch (gifError) {
                                    this.logWarn('Could not process GIF with MediaParser, will use basic detection', {
                                        txId,
                                        error: gifError instanceof Error ? gifError.message : String(gifError)
                                    });
                                }
                            }
                            // PDF signature: 25 50 44 46
                            else if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
                                contentType = 'application/pdf';
                            }
                        }
                    } catch (error) {
                        this.logError('Error analyzing binary data', { 
                            error: error instanceof Error ? error.message : String(error),
                            txId
                        });
                    }
                }
                
                // Set content and metadata based on detected or provided content type
                if (contentType.startsWith('image/')) {
                    this.logInfo(`📸 Processing ${contentType} image data`, { txId });
                    result.content = `Binary image data (${contentType})`;
                    result.content_type = contentType;
                    result.media_type = contentType;
                    result.raw_image_data = hexData;
                    
                    // If it's a GIF and we haven't already processed it with MediaParser
                    if (contentType === 'image/gif' && !result.image_metadata) {
                        try {
                            const fullGifBuffer = Buffer.from(hexData, 'hex');
                            const { metadata } = this.mediaParser.process_gif_image(fullGifBuffer, txId);
                            result.image_metadata = metadata;
                            this.logInfo('🎬 Processed GIF with MediaParser', { txId, metadata });
                        } catch (gifError) {
                            this.logWarn('Error processing GIF with MediaParser, using basic metadata', {
                                txId,
                                error: gifError instanceof Error ? gifError.message : String(gifError)
                            });
                            // Fall back to basic metadata
                            result.image_metadata = {
                                format: 'gif',
                                size: hexData.length / 2
                            };
                        }
                    } else if (!result.image_metadata) {
                        // Basic metadata for other image types
                        result.image_metadata = {
                            format: contentType.split('/')[1],
                            size: hexData.length / 2
                        };
                    }
                    
                    result.metadata.raw_image_data = hexData;
                    result.metadata.image_metadata = result.image_metadata;
                    result.metadata.media_type = contentType;
                    result.metadata.content_type = contentType;
                } else {
                    result.content = `hex:${hexData}`;
                    result.content_type = contentType;
                    result.metadata.content_type = contentType;
                }
                
                result.content_type = contentType;
                result.metadata.binary_items_count = binaryItems.length;
                
                return result;
            }
            
            // Look for structured content like vote data
            // First, check if this is a vote transaction
            const isVote = this.voteParser.is_vote_transaction(txData);
            
            this.logInfo('Vote detection result', { 
                txId, 
                isVote, 
                data_length: txData.length,
                data_sample: txData.slice(0, 2)
            });
            
            if (isVote) {
                result.content_type = 'vote';
                // Set is_vote flag explicitly - this is critical for correct processing
                result.metadata.is_vote = true;
                
                // Get detailed vote content from VoteParser's specialized extraction
                const voteContent = this.voteParser.extractVoteContent(txData);
                
                // Use the richest content from vote extraction
                if (voteContent.question) {
                    result.content = voteContent.question;
                    result.metadata.vote_question = voteContent.question;
                }
                
                // Ensure we have vote options, even if they're basic yes/no
                if (voteContent.options && voteContent.options.length > 0) {
                    result.metadata.vote_options = voteContent.options;
                    result.metadata.options_count = voteContent.options.length;
                } else {
                    // Add default options if none provided
                    result.metadata.vote_options = ['Yes', 'No'];
                    result.metadata.options_count = 2;
                }
                
                // Include all metadata from vote extraction
                result.metadata = { 
                    ...result.metadata, 
                    ...voteContent.metadata,
                    type: 'vote' // Explicitly set type to vote
                };
                
                // Add any specific properties directly to the result
                if (voteContent.post_id) result.metadata.post_id = voteContent.post_id;
                if (voteContent.timestamp) result.metadata.timestamp = voteContent.timestamp;
                if (voteContent.creator) result.metadata.creator = voteContent.creator;
                
                this.logInfo('✅ Extracted vote content', { 
                    txId,
                    content_length: result.content.length,
                    options_count: result.metadata.options_count || 0,
                    options: result.metadata.vote_options,
                    metadata_keys: Object.keys(result.metadata).join(', ')
                });
                
                return result;
            }
            
            // Extract text content (prioritize 'content=' fields)
            const contentItems = txData.filter(item => item.startsWith('content='));
            if (contentItems.length > 0) {
                // Get the main content item (usually the first one without numeric prefix)
                const mainContent = contentItems.find(item => !item.match(/content=\d+\s/));
                if (mainContent) {
                    result.content = mainContent.replace('content=', '');
                }
                // If no main content found, use the first content item
                else if (contentItems.length > 0) {
                    result.content = contentItems[0].replace('content=', '');
                }
                
                // Check if content contains HTML
                if (result.content.includes('<html>') || result.content.includes('<div') || 
                    result.content.includes('<p>') || result.content.includes('<img')) {
                    result.content_type = 'html';
                }
            }
            
            // Extract metadata from various fields
            txData.forEach(item => {
                if (item.startsWith('app=')) {
                    result.metadata.app = item.replace('app=', '');
                } else if (item.startsWith('type=')) {
                    result.metadata.type = item.replace('type=', '');
                } else if (item.startsWith('media_type=')) {
                    result.metadata.media_type = item.replace('media_type=', '');
                    // Update content type if media_type is found
                    if (['image', 'video', 'audio'].includes(result.metadata.media_type)) {
                        result.content_type = result.metadata.media_type;
                    }
                } else if (item.startsWith('media_url=')) {
                    result.metadata.media_url = item.replace('media_url=', '');
                } else if (item.startsWith('timestamp=')) {
                    result.metadata.timestamp = item.replace('timestamp=', '');
                } else if (item.startsWith('author=')) {
                    result.metadata.author = item.replace('author=', '');
                }
            });
            
            return result;
        } catch (error) {
            this.logError('Error extracting specialized content', {
                error: error instanceof Error ? error.message : String(error),
                txId
            });
            return {
                content: '',
                content_type: 'unknown',
                metadata: {}
            };
        }
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
        // Call the common implementation from BaseParser
        super.prune_cache(this.transactionCache, this.MAX_CACHE_SIZE);
    }

    /**
     * Extract key-value pairs from decoded string data with additional Lock protocol specific processing
     * @param decodedData Decoded string data from transaction
     * @returns Array of key-value strings
     */
    private extractLockProtocolKeyValuePairs(decodedData: string): string[] {
        // Use the helper function to extract basic key-value pairs
        const pairs = extract_key_value_pairs(decodedData);
        
        // Add additional processing for Lock protocol specific identifiers
        const result = [...pairs];
        
        try {
            // Look for key@value patterns (common in some Lock protocol transactions)
            const keyValueAtPattern = /([a-zA-Z0-9_]+)@([a-zA-Z0-9_\-]+)/g;
            let atMatch;
            
            while ((atMatch = keyValueAtPattern.exec(decodedData)) !== null) {
                const [fullMatch, key, value] = atMatch;
                if (key && value && key.length > 3) { // Avoid very short keys which might be false positives
                    // Convert to standard format
                    const standardFormat = `${key}=${value}`;
                    if (!result.includes(standardFormat)) {
                        result.push(standardFormat);
                    }
                    
                    // Also add the original format for maximum compatibility
                    if (!result.includes(fullMatch)) {
                        result.push(fullMatch);
                    }
                    
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
                if (decodedData.includes(identifier) && !result.includes(identifier)) {
                    result.push(identifier);
                }
            }
            
            // Extract content that's not part of key-value pairs if there's significant text
            const contentPattern = /content=([^\s]+)/;
            const contentMatch = decodedData.match(contentPattern);
            if (!contentMatch || !contentMatch[1]) {
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
                        if (!hasWeirdCharacters && !result.includes(longestChunk)) {
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
                    const optionsHashPair = `options_hash=${optionsHashMatch[1]}`;
                    if (!result.includes(optionsHashPair)) {
                        result.push(optionsHashPair);
                        this.logDebug('Extracted options_hash with special handling', { 
                            value: optionsHashMatch[1]
                        });
                    }
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
