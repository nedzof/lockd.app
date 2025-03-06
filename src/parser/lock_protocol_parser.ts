/**
 * LockProtocolParser: Responsible for parsing Lock protocol specific data
 * 
 * This class is the core parser responsible for extracting and processing Lock protocol
 * data from blockchain transactions. It serves as an orchestrator that:
 * 
 * 1. Identifies Lock protocol transactions (via LOCK markers or app=lockd.app)
 * 2. Extracts content, tags, and metadata from transaction data
 * 3. Processes vote-related content with specialized extraction logic
 * 4. Extracts media content via MediaParser integration
 * 5. Normalizes key-value data into a consistent format
 * 
 * The parser maintains clear separation of concerns:
 * - For vote content: delegates to VoteParser for specialized vote extraction
 * - For media content: delegates to MediaParser
 * - For data normalization: uses helper utilities like extract_tags
 * 
 * This design ensures each parser focuses on its specific domain while the
 * LockProtocolParser coordinates the overall content extraction process.
 */
import { BaseParser } from './base_parser.js';
import { LockProtocolData, JungleBusResponse } from '../shared/types.js';
import { 
    extract_tags, 
    decode_hex_string, 
    extract_key_value_pairs, 
    normalize_key, 
    process_buffer_data 
} from './utils/helpers.js';
import { MediaParser } from './media_parser.js';
import { VoteParser } from './vote_parser.js';

export class LockProtocolParser extends BaseParser {
    private media_parser: MediaParser;
    private vote_parser: VoteParser;

    constructor() {
        super();
        this.media_parser = new MediaParser();
        this.vote_parser = new VoteParser();
    }

    /**
     * Extract Lock protocol data from transaction
     * 
     * This method orchestrates the complete Lock protocol data extraction process:
     * 1. Identifies Lock protocol markers and app identifiers
     * 2. Extracts content from tx.data with proper prioritization
     * 3. Processes all key-value pairs for metadata extraction
     * 4. Extracts and processes tags
     * 5. Handles media content extraction through MediaParser
     * 6. For vote transactions, coordinates with VoteParser
     * 7. Sets transaction identifiers and author information
     * 
     * The extraction process maintains consistent data formats and comprehensive
     * error handling to ensure robust transaction processing.
     * 
     * @param tx The transaction object from JungleBus or other sources
     * @returns The extracted and normalized Lock protocol data, or null if not a Lock protocol transaction
     */
    public extract_lock_protocol_data(tx: any): LockProtocolData | null {
        try {
            if (!tx) {
                this.logError('No transaction provided');
                return null;
            }

            const data = this.extract_data_from_transaction(tx);
            if (!data || !Array.isArray(data) || data.length === 0) {
                this.logError('No data extracted from transaction', { tx_id: tx?.id || 'unknown' });
                return null;
            }

            // Identify if this is a Lock protocol transaction through markers or app identifier
            let isLockProtocol = false;
            const isLockApp = data.some(item => item.includes('app=lockd.app'));
            
            // Process lock protocol data
            const lockData: Record<string, any> = {
                post_id: '',
                post_txid: tx?.id || '',  // Ensure post_txid is set from the transaction ID
                created_at: new Date().toISOString(),
                content: '',
                content_type: 'text/plain',  // Default content type
                tags: [],
                is_vote: false,
                is_locked: false
            };

            // First, check if we have content in the tx.data array
            // This is prioritized over other content sources to ensure data integrity
            // (Implementation of the fix described in the memory about contentFromTxData)
            let contentFromTxData = this.extract_content_from_tx_data(tx);
            if (contentFromTxData) {
                lockData.content = contentFromTxData;
                this.logDebug('Found content in tx.data array', {
                    content_length: contentFromTxData.length,
                    tx_id: tx?.id || 'unknown'
                });
            }

            // Parse the data array for lock protocol data
            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                
                // Check for lock protocol
                if (item === 'LOCK' || item === 'lock' || 
                    (item.startsWith('LOCK') && item.length < 10) || 
                    (item.startsWith('lock') && item.length < 10)) {
                    isLockProtocol = true;
                    this.logDebug('Found explicit LOCK marker', { item, tx_id: tx?.id || 'unknown' });
                    continue;
                }
                
                // Skip non-lock protocol transactions
                if (!isLockProtocol) {
                    continue;
                }
                
                // Check for content (only if not already set from tx.data)
                if (item.startsWith('content=') && !contentFromTxData) {
                    lockData.content = item.replace('content=', '');
                    this.logDebug('Found content with explicit key', { 
                        content_preview: lockData.content.substring(0, 50) + (lockData.content.length > 50 ? '...' : ''), 
                        tx_id: tx?.id || 'unknown' 
                    });
                    continue;
                } else if (item.length > 0 && !lockData.content && !contentFromTxData && 
                    item !== 'LOCK' && item !== 'lock' && 
                    !item.startsWith('app=') && 
                    !item.includes('=')) {
                    lockData.content = item;
                    this.logDebug('Found content without explicit key', { 
                        content_preview: lockData.content.substring(0, 50) + (lockData.content.length > 50 ? '...' : ''), 
                        tx_id: tx?.id || 'unknown' 
                    });
                    continue;
                }
                
                // Check for is_vote flag
                if (item === 'is_vote=true') {
                    lockData.is_vote = true;
                    this.logDebug('Found is_vote=true flag', { tx_id: tx?.id || 'unknown' });
                    continue;
                }
                
                // Check for is_locked flag
                if (item === 'is_locked=true') {
                    lockData.is_locked = true;
                    this.logDebug('Found is_locked=true flag', { tx_id: tx?.id || 'unknown' });
                    continue;
                }
            }

            // Process all key-value pairs from the data array
            this.process_all_key_value_pairs(data, lockData, contentFromTxData !== '');

            // Extract tags
            const tags = extract_tags(data);
            if (tags.length > 0) {
                lockData.tags = tags;
            }
            
            // Extract image data
            const imageData = this.media_parser.extract_image_data(tx);
            if (imageData) {
                lockData.image = imageData;
                lockData.media_type = 'image';
                
                // If we have image data but no content, use the image alt text as content
                if (!lockData.content && imageData.alt_text) {
                    lockData.content = imageData.alt_text;
                    this.logDebug('Using image alt_text as content', { 
                        content: lockData.content, 
                        tx_id: tx?.id || 'unknown' 
                    });
                }
            }
            
            // If this is a vote transaction, extract vote-specific content
            // This leverages the VoteParser's enhanced capabilities
            // (As described in the memory about vote transaction processing)
            if (lockData.is_vote) {
                const voteContent = this.extract_vote_content(tx);
                
                if (voteContent.question) {
                    lockData.vote_question = voteContent.question;
                    
                    // If we don't have content yet, use the vote question
                    if (!lockData.content) {
                        lockData.content = voteContent.question;
                        this.logDebug('Using vote question as content', { 
                            content: lockData.content, 
                            tx_id: tx?.id || 'unknown' 
                        });
                    }
                }
                
                if (voteContent.options && voteContent.options.length > 0) {
                    lockData.vote_options = voteContent.options;
                    lockData.total_options = voteContent.options.length;
                }
            }
            
            // Set post_txid if not already set
            if (!lockData.post_txid && tx.id) {
                lockData.post_txid = tx.id;
            }
            
            // Get sender address
            try {
                const senderAddress = this.get_sender_address(tx);
                if (senderAddress) {
                    lockData.author_address = senderAddress;
                }
            } catch (error) {
                this.logError('Error getting sender address', { 
                    error: error instanceof Error ? error.message : String(error),
                    tx_id: tx?.id || 'unknown'
                });
            }
            
            // Determine if this is a Lock protocol transaction
            const hasLockIndicators = isLockProtocol || isLockApp;
            
            this.logInfo('Found Lock protocol transaction indicators', { 
                hasLockIndicators,
                hasLockProtocol: isLockProtocol,
                isLockApp,
                tx_id: tx?.id || 'unknown'
            });
            
            if (!hasLockIndicators) {
                return null;
            }
            
            // Validate the data
            if (!lockData.content) {
                this.logWarn('No content found in Lock protocol data', { tx_id: tx?.id || 'unknown' });
                // Ensure at least an empty string for content
                lockData.content = '';
            }
            
            // Make sure content_type is set
            if (!lockData.content_type) {
                // Try to determine content type from content
                if (lockData.content.startsWith('hex:')) {
                    lockData.content_type = 'application/octet-stream';
                } else if (lockData.image) {
                    lockData.content_type = 'image/png'; // Default image type
                } else {
                    lockData.content_type = 'text/plain';
                }
            }
            
            this.logInfo('Successfully extracted Lock protocol data', { 
                tx_id: tx?.id || 'unknown',
                has_content: !!lockData.content,
                content_length: lockData.content ? lockData.content.length : 0,
                content_type: lockData.content_type,
                tag_count: lockData.tags.length,
                is_vote: lockData.is_vote,
                is_locked: lockData.is_locked
            });
            
            return lockData as LockProtocolData;
        } catch (error) {
            this.logError('Error extracting Lock protocol data', { 
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return null;
        }
    }

    /**
     * Extract vote content from transaction data
     * 
     * Leverages the VoteParser to extract vote-specific data from transactions.
     * This method is part of the vote transaction processing system that handles:
     * 1. Extracting the vote question
     * 2. Identifying vote options
     * 3. Collecting metadata like timestamps and option counts
     * 
     * The implementation ensures proper handling of different transaction data formats
     * (array and object) as mentioned in the vote transaction processing memory.
     * 
     * @param tx - The transaction object containing vote data
     * @returns Object containing vote question, options, and related metadata
     */
    public extract_vote_content(tx: any): { 
        question: string;
        options: string[];
        post_id?: string;
        timestamp?: string;
        total_options?: number;
        is_locked?: boolean;
    } {
        try {
            if (!tx || !tx.data || !Array.isArray(tx.data)) {
                this.logDebug('No transaction data array found');
                return { question: '', options: [] };
            }
            
            // Use the initialized vote_parser instance
            const voteContent = this.vote_parser.extractVoteContent(tx.data);
            
            this.logDebug('Extracted vote content', { 
                question: voteContent.question,
                options_count: voteContent.options.length,
                tx_id: tx?.id || 'unknown'
            });
            
            return voteContent;
        } catch (error) {
            this.logError('Error extracting vote content', { 
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return { question: '', options: [] };
        }
    }
    
    /**
     * Extract content from transaction data array
     * 
     * This method specifically focuses on extracting content from the tx.data array,
     * which is prioritized over other content sources. It handles multiple content formats:
     * 1. Explicit content with 'content=' prefix
     * 2. Binary data with 'hex:' encoding (from TransactionDataParser improvements)
     * 3. Buffer data requiring special processing
     * 4. Implicit content as standalone strings
     * 
     * The implementation ensures consistent handling of both text and binary data
     * as described in the transaction data processing memory.
     * 
     * @param tx The transaction object
     * @returns Content string or empty string if not found
     */
    private extract_content_from_tx_data(tx: any): string {
        try {
            if (!tx || !tx.data || !Array.isArray(tx.data)) {
                return '';
            }
            
            // First check for explicit content key
            for (const dataItem of tx.data) {
                if (typeof dataItem === 'string' && dataItem.toLowerCase().startsWith('content=')) {
                    const content = dataItem.substring(dataItem.indexOf('=') + 1);
                    this.logDebug('Found content with explicit key in tx.data', { 
                        content_preview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                        tx_id: tx?.id || 'unknown'
                    });
                    return content;
                }
                
                // Check for binary data (hex encoded)
                // This leverages the hex-encoding prefix system implemented in TransactionDataParser
                // for consistent binary data handling across the application
                if (typeof dataItem === 'string' && dataItem.startsWith('hex:')) {
                    this.logDebug('Found binary content in tx.data', { 
                        tx_id: tx?.id || 'unknown',
                        data_length: dataItem.length - 4 // Subtract 'hex:' prefix length
                    });
                    return dataItem; // Return the hex-encoded data directly
                }
                
                // Try to process Buffer data if it's a Buffer
                if (Buffer.isBuffer(dataItem)) {
                    const processedData = process_buffer_data(dataItem, tx?.id || 'unknown');
                    if (processedData) {
                        this.logDebug('Processed buffer data from tx.data', {
                            tx_id: tx?.id || 'unknown',
                            data_preview: processedData.substring(0, 50) + (processedData.length > 50 ? '...' : '')
                        });
                        return processedData;
                    }
                }
            }
            
            // Then check for first non-empty, non-protocol item
            for (const dataItem of tx.data) {
                if (dataItem && 
                    typeof dataItem === 'string' &&
                    dataItem !== 'LOCK' && 
                    dataItem !== 'lock' && 
                    !dataItem.startsWith('app=') && 
                    !dataItem.includes('=')) {
                    this.logDebug('Found content without explicit key in tx.data', { 
                        content_preview: dataItem.substring(0, 50) + (dataItem.length > 50 ? '...' : ''),
                        tx_id: tx?.id || 'unknown'
                    });
                    return dataItem;
                }
            }
            
            return '';
        } catch (error) {
            this.logError('Error extracting content from tx.data', { 
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return '';
        }
    }
    
    /**
     * Process all key-value pairs from transaction data
     * 
     * Extracts and processes all key-value pairs from transaction data, handling both:
     * 1. Single key-value pairs (key=value)
     * 2. Multiple key-value pairs in a single string (key1=value1&key2=value2)
     * 
     * The skipContentUpdate parameter is crucial for implementing the priority
     * system where content from tx.data array is preserved and not overwritten
     * by subsequent processing, as described in the memory about contentFromTxData.
     * 
     * @param data Array of transaction data strings
     * @param metadata The metadata object to update with extracted values
     * @param skipContentUpdate If true, don't update the content field (prioritizes tx.data content)
     */
    private process_all_key_value_pairs(data: string[], metadata: Record<string, any>, skipContentUpdate: boolean = false): void {
        // Process each data item separately
        for (const item of data) {
            // Skip items that don't contain key-value pairs
            if (!item.includes('=')) {
                continue;
            }
            
            // For items that might contain multiple key-value pairs
            if (item.includes('&')) {
                // Use the helper function to extract all key-value pairs
                const pairs = extract_key_value_pairs(item);
                
                this.logDebug('Extracted multiple key-value pairs', {
                    original_item: item.length > 50 ? `${item.substring(0, 50)}...` : item,
                    extracted_pairs: pairs.length
                });
                
                // Process each extracted pair
                for (const pair of pairs) {
                    const parts = pair.split('=');
                    if (parts.length < 2) continue;
                    
                    const key = normalize_key(parts[0]);
                    // Skip processing content key if skipContentUpdate is true
                    if (key === 'content' && skipContentUpdate) {
                        continue;
                    }
                    
                    const value = parts.slice(1).join('='); // Rejoin in case value contains =
                    this.process_key_value_pair(key, value, metadata, skipContentUpdate);
                }
            } else {
                // Simple key-value pair
                const parts = item.split('=');
                if (parts.length < 2) {
                    continue;
                }
                
                const key = normalize_key(parts[0]);
                // Skip processing content key if skipContentUpdate is true
                if (key === 'content' && skipContentUpdate) {
                    continue;
                }
                
                const value = parts.slice(1).join('='); // Rejoin in case value contains =
                this.process_key_value_pair(key, value, metadata, skipContentUpdate);
            }
        }
    }

    /**
     * Process key-value pair from transaction data
     * 
     * Normalizes and processes individual key-value pairs, mapping them to
     * appropriate fields in the metadata object. This method handles special
     * keys like 'content', 'app', and vote-related fields with specific logic.
     * 
     * The skipContentUpdate parameter implements the priority system where
     * content from tx.data array takes precedence over other content sources,
     * ensuring data integrity as described in the contentFromTxData memory.
     * 
     * @param key The key from the key-value pair (normalized internally)
     * @param value The value from the key-value pair
     * @param metadata The metadata object to update with the processed value
     * @param skipContentUpdate If true, don't update the content field
     */
    private process_key_value_pair(
        key: string, 
        value: string, 
        metadata: Record<string, any>,
        skipContentUpdate: boolean = false
    ): void {
        // Create a safe preview of the value for logging
        const valuePreview = value.startsWith('hex:') 
            ? 'hex:...' + value.substring(value.length - 10) 
            : value.substring(0, 30) + (value.length > 30 ? '...' : '');
            
        this.logDebug('Processing key-value pair', { key, value_preview: valuePreview, tx_id: metadata.post_id || 'unknown' });
        
        // Skip content updates if requested
        if (key === 'content' && skipContentUpdate) {
            return;
        }
        
        // Handle binary data specially
        if (value.startsWith('hex:') && key === 'content') {
            metadata.content = value; // Store the hex-encoded data directly
            metadata.is_binary = true;
            this.logDebug('Stored binary content', { tx_id: metadata.post_id || 'unknown' });
            return;
        }
        
        switch (key) {
            case 'content_type':
                metadata.content_type = value;
                // Check if this is an image
                if (value.startsWith('image/')) {
                    metadata.image_metadata = metadata.image_metadata || {};
                    metadata.image_metadata.content_type = value;
                    metadata.image_metadata.is_image = true;
                }
                break;
                
            case 'filename':
                metadata.image_metadata = metadata.image_metadata || {};
                metadata.image_metadata.filename = value;
                break;
                
            case 'width':
                const width = parseInt(value, 10);
                if (!isNaN(width)) {
                    metadata.image_metadata = metadata.image_metadata || {};
                    metadata.image_metadata.width = width;
                }
                break;
                
            case 'height':
                const height = parseInt(value, 10);
                if (!isNaN(height)) {
                    metadata.image_metadata = metadata.image_metadata || {};
                    metadata.image_metadata.height = height;
                }
                break;
                
            case 'lock_amount':
            case 'lockamount':
                const lockAmount = parseInt(value, 10);
                if (!isNaN(lockAmount)) {
                    metadata.lock_amount = lockAmount;
                    metadata.is_locked = true;
                }
                break;
                
            case 'lock_duration':
            case 'lockduration':
                const lockDuration = parseInt(value, 10);
                if (!isNaN(lockDuration)) {
                    metadata.lock_duration = lockDuration;
                }
                break;
                
            case 'is_vote':
            case 'isvote':
            case 'vote':
                metadata.is_vote = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes' || value === '1';
                this.logDebug('Processing vote flag', { key, value, result: metadata.is_vote, tx_id: metadata.post_id || 'unknown' });
                break;
            
            case 'options_hash':
            case 'optionshash':
                metadata.options_hash = value;
                this.logDebug('Found options hash', { options_hash: value, tx_id: metadata.post_id || 'unknown' });
                break;
                
            case 'vote_options':
            case 'voteoptions':
                try {
                    // Check if it's a JSON string
                    if (value.startsWith('[') && value.endsWith(']')) {
                        metadata.vote_options = JSON.parse(value);
                        metadata.total_options = metadata.vote_options.length;
                    } else {
                        // Try to parse as comma-separated list
                        metadata.vote_options = value.split(',').map(option => option.trim());
                        metadata.total_options = metadata.vote_options.length;
                    }
                    this.logDebug('Parsed vote options', { 
                        option_count: metadata.vote_options.length, 
                        tx_id: metadata.post_id || 'unknown' 
                    });
                } catch (e) {
                    this.logWarn('Failed to parse vote options', {
                        error: e instanceof Error ? e.message : String(e),
                        value: value,
                        tx_id: metadata.post_id || 'unknown'
                    });
                    // Store as is
                    metadata.vote_options = [value];
                    metadata.total_options = 1;
                }
                break;
            
            case 'vote_question':
            case 'votequestion':
                metadata.vote_question = value;
                this.logDebug('Found vote question', { question: value, tx_id: metadata.post_id || 'unknown' });
                break;
                
            case 'post_id':
            case 'postid':
                metadata.post_id = value;
                this.logDebug('Found reference post ID', { post_id: value, tx_id: metadata.post_id || 'unknown' });
                break;
                
            case 'post_txid':
            case 'posttxid':
                metadata.post_txid = value;
                this.logDebug('Found explicit post_txid', { post_txid: value, tx_id: metadata.post_id || 'unknown' });
                break;
                
            case 'content':
                // Only update content if not already set from tx.data
                if (!skipContentUpdate) {
                    // Check if this is binary data
                    if (value.startsWith('hex:')) {
                        metadata.content = value; // Store the hex-encoded data directly
                        metadata.is_binary = true;
                        this.logDebug('Updated binary content', { 
                            tx_id: metadata.post_id || 'unknown' 
                        });
                    } else {
                        metadata.content = value;
                        this.logDebug('Updated text content', { 
                            content_preview: value.substring(0, 50) + (value.length > 50 ? '...' : ''), 
                            tx_id: metadata.post_id || 'unknown' 
                        });
                    }
                }
                break;
                
            default:
                // Store other key-value pairs
                metadata[key] = value;
                break;
        }
    }

    /**
     * Get the sender address from the transaction
     * @param tx Transaction object
     * @returns Sender address or empty string if not found
     */
    private get_sender_address(tx: JungleBusResponse): string {
        try {
            // First try to get from addresses array
            if (tx.addresses && tx.addresses.length > 0) {
                return tx.addresses[0];
            }
            
            // Fallback to inputs
            return tx.inputs && tx.inputs[0] ? tx.inputs[0].address : '';
        } catch (error) {
            this.logError('Error getting sender address', {
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return '';
        }
    }

    /**
     * Extract data from transaction
     * @param tx The transaction object
     * @returns Array of strings containing transaction data
     */
    private extract_data_from_transaction(tx: any): string[] {
        try {
            if (!tx) {
                this.logError('No transaction provided');
                return [];
            }
            
            // If tx.data is already an array of strings, use it directly
            if (tx.data && Array.isArray(tx.data)) {
                this.logDebug('Using tx.data array directly', { 
                    data_length: tx.data.length,
                    tx_id: tx?.id || 'unknown'
                });
                return tx.data;
            }
            
            // Otherwise, try to extract data from transaction outputs
            const data: string[] = [];
            
            // Check if we have outputs
            if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const output of tx.outputs) {
                    // Check for OP_RETURN outputs
                    if (output.script && output.script.startsWith('006a')) {
                        try {
                            // Decode the script
                            const hexData = output.script.substring(4); // Remove OP_RETURN prefix
                            const decodedData = decode_hex_string(hexData);
                            
                            // Check if the decoded data is binary
                            if (decodedData.startsWith('hex:')) {
                                // This is already processed binary data, add it directly
                                data.push(decodedData);
                                this.logDebug('Added pre-processed binary data', {
                                    tx_id: tx?.id || 'unknown'
                                });
                            } else {
                                // Split by newlines and add to data array
                                const lines = decodedData.split('\n');
                                for (const line of lines) {
                                    if (line.trim()) {
                                        data.push(line.trim());
                                    }
                                }
                                
                                this.logDebug('Extracted data from OP_RETURN output', { 
                                    data_length: lines.length,
                                    tx_id: tx?.id || 'unknown'
                                });
                            }
                        } catch (error) {
                            this.logError('Error decoding OP_RETURN data', { 
                                error: error instanceof Error ? error.message : String(error),
                                tx_id: tx?.id || 'unknown'
                            });
                        }
                    }
                }
            }
            
            // If we have no data yet, check for tx.tx_data
            if (data.length === 0 && tx.tx_data) {
                try {
                    // Split by newlines and add to data array
                    const lines = tx.tx_data.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            data.push(line.trim());
                        }
                    }
                    
                    this.logDebug('Extracted data from tx.tx_data', { 
                        data_length: lines.length,
                        tx_id: tx?.id || 'unknown'
                    });
                } catch (error) {
                    this.logError('Error processing tx.tx_data', { 
                        error: error instanceof Error ? error.message : String(error),
                        tx_id: tx?.id || 'unknown'
                    });
                }
            }
            
            return data;
        } catch (error) {
            this.logError('Error extracting data from transaction', { 
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return [];
        }
    }
}
