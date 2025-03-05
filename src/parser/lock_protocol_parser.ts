/**
 * LockProtocolParser: Responsible for parsing Lock protocol specific data
 */
import { BaseParser } from './base_parser.js';
import { LockProtocolData, JungleBusResponse } from '../shared/types.js';
import { extract_tags, decode_hex_string } from './utils/helpers.js';
import { MediaParser } from './media_parser.js';

export class LockProtocolParser extends BaseParser {
    private media_parser: MediaParser;

    constructor() {
        super();
        this.media_parser = new MediaParser();
    }

    /**
     * Extract Lock protocol data from transaction data
     * @param data Array of strings containing transaction data
     * @param tx Transaction object
     * @returns LockProtocolData object or null if not a Lock protocol transaction
     */
    public extract_lock_protocol_data(data: string[], tx: JungleBusResponse): LockProtocolData | null {
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
            // Check if this is a LOCK protocol transaction - expanded to catch more cases
            // First, look for "app=lockd.app" indicator
            const isLockApp = data.some(item => {
                if (typeof item !== 'string') return false;
                
                // Direct check for app identifier
                if (item.includes('app=lockd.app') || item.includes('app=lock')) {
                    return true;
                }
                
                // Check hex-encoded app identifier
                if (item.match(/^[0-9a-fA-F]+$/)) {
                    try {
                        const decoded = decode_hex_string(item);
                        if (decoded.includes('app=lockd.app') || decoded.includes('app=lock')) {
                            return true;
                        }
                    } catch (e) {
                        // Ignore decode errors
                    }
                }
                
                return false;
            });
            
            // Second, look for "LOCK" protocol indicator
            const hasLockProtocol = data.some(item => {
                if (typeof item !== 'string') return false;
                return item === 'LOCK' || 
                       (item.startsWith('LOCK') && item.length < 10) || // Avoid matching content that happens to start with LOCK
                       item === 'lock' || 
                       (item.startsWith('lock') && item.length < 10);
            });
            
            // Third, look for lock amount indicators
            const hasLockIndicators = data.some(item => {
                if (typeof item !== 'string') return false;
                return item.includes('lock_amount=') || 
                       item.includes('lockAmount=') || 
                       item.includes('lock_duration=') || 
                       item.includes('lockDuration=') || 
                       item.includes('is_locked=true');
            });
            
            // Consider it a Lock protocol transaction if any of these conditions are met
            const isLockProtocolTx = isLockApp || hasLockProtocol || hasLockIndicators;
            
            if (!isLockProtocolTx) {
                this.logWarn('Not a Lock protocol transaction', { 
                    tx_id: tx?.id || 'unknown',
                    data_sample: data.slice(0, 3).map(item => typeof item === 'string' ? item.substring(0, 50) : 'non-string'),
                    data_length: data.length
                });
                return null;
            }
            
            this.logInfo('Found Lock protocol transaction indicators', { 
                tx_id: tx?.id || 'unknown', 
                isLockApp, 
                hasLockProtocol, 
                hasLockIndicators 
            });

            // Already logged above with more details

            // Initialize isLockProtocol flag
            let isLockProtocol = false;

            // Process lock protocol data
            const lockData: Record<string, any> = {
                post_id: '',
                post_txid: '',
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
                
                // Check for content
                if (item.startsWith('content=')) {
                    lockData.content = item.replace('content=', '');
                    this.logDebug('Found content with explicit key', { 
                        content_preview: lockData.content.substring(0, 50) + (lockData.content.length > 50 ? '...' : ''), 
                        tx_id: tx?.id || 'unknown' 
                    });
                    continue;
                } else if (item.length > 0 && !lockData.content && 
                    item !== 'LOCK' && item !== 'lock' && 
                    !item.startsWith('app=') && 
                    !item.includes('=')) {
                    // This is a fallback for content without explicit key
                    // Check if it contains special patterns like `options_hash@`
                    if (item.includes('@')) {
                        // This might be a data reference like options_hash@value
                        const parts = item.split('@');
                        if (parts.length === 2) {
                            const key = this.normalizeKey(parts[0]);
                            const value = parts[1];
                            // Set the value in lockData
                            lockData[key] = value;
                            this.logDebug(`Found ${key} with special format`, { 
                                key, 
                                value_preview: value.substring(0, 30) + (value.length > 30 ? '...' : ''),
                                tx_id: tx?.id || 'unknown' 
                            });
                            continue; // Skip normal content assignment
                        }
                    }
                    
                    // Check if this content has binary data (shown as �� in the output)
                    if (/\u{FFFD}/u.test(item) || /[^\x20-\x7E]/.test(item)) {
                        this.logDebug('Found potential binary data in content, skipping', { 
                            content_preview: item.substring(0, 20) + (item.length > 20 ? '...' : ''), 
                            tx_id: tx?.id || 'unknown' 
                        });
                        // Let's not set this as content - it's likely binary data
                        // Instead, look for Bitcoin addresses which might be valuable information
                        const btcAddressMatch = item.match(/([13][a-km-zA-HJ-NP-Z1-9]{25,34})/g);
                        if (btcAddressMatch && btcAddressMatch.length > 0) {
                            this.logDebug('Found Bitcoin address in binary data', { 
                                address: btcAddressMatch[0], 
                                tx_id: tx?.id || 'unknown' 
                            });
                            // Use the Bitcoin address as content instead of binary data
                            lockData.content = btcAddressMatch[0];
                        }
                        continue;
                    }
                    
                    // Regular content assignment for valid text content
                    lockData.content = item;
                    this.logDebug('Found content without explicit key', { 
                        content_preview: item.substring(0, 50) + (item.length > 50 ? '...' : ''), 
                        tx_id: tx?.id || 'unknown' 
                    });
                    continue;
                }
                
                // Check for vote
                if (item === 'VOTE' || item === 'vote' || 
                    item.includes('VOTE') || item.includes('vote') || 
                    item.includes('is_vote=true') || item.includes('isVote=true')) {
                    lockData.is_vote = true;
                    this.logDebug('Found vote indicator', { item, tx_id: tx?.id || 'unknown' });
                    continue;
                }
                
                // Initialize vote options array if it doesn't exist
                if (lockData.is_vote && !lockData.vote_options) {
                    lockData.vote_options = [];
                    lockData.total_options = 0;
                }
                
                // Handle vote question
                if (lockData.is_vote && item.startsWith('vote_question=')) {
                    lockData.vote_question = item.replace('vote_question=', '');
                    this.logDebug('Found vote question with explicit key', { 
                        question: lockData.vote_question,
                        tx_id: tx?.id || 'unknown'
                    });
                    continue;
                }
                
                // Identify vote option by index
                if (lockData.is_vote && item.startsWith('optionIndex=')) {
                    // Found an option index, the next item should be the option text
                    const optionIndex = item.replace('optionIndex=', '');
                    this.logDebug('Found option index', { optionIndex, tx_id: tx?.id || 'unknown' });
                    continue;
                }
                
                // If this is a vote but no explicit question is set and no content exists,
                // use the content as the vote question
                if (lockData.is_vote && !lockData.vote_question && lockData.content) {
                    lockData.vote_question = lockData.content;
                    this.logDebug('Using content as vote question', { 
                        question: lockData.vote_question,
                        tx_id: tx?.id || 'unknown'
                    });
                }
                
                // Add vote options - any text item might be an option if no better structure is found
                if (lockData.is_vote && lockData.vote_options && 
                    item.length > 0 && 
                    !item.includes('=') && 
                    item !== 'LOCK' && item !== 'lock' && 
                    item !== 'VOTE' && item !== 'vote' && 
                    item !== lockData.vote_question && 
                    item !== lockData.content) {
                    
                    lockData.vote_options.push(item);
                    lockData.total_options = lockData.vote_options.length;
                    this.logDebug('Added vote option', { 
                        option: item,
                        option_count: lockData.vote_options.length,
                        tx_id: tx?.id || 'unknown'
                    });
                    continue;
                }
                
                // Check for lock amount
                if (item.startsWith('lock_amount=') || item.startsWith('lockAmount=')) {
                    const valueStr = item.includes('lock_amount=') ? 
                        item.replace('lock_amount=', '') : 
                        item.replace('lockAmount=', '');
                    const lockAmount = parseInt(valueStr, 10);
                    if (!isNaN(lockAmount)) {
                        lockData.lock_amount = lockAmount;
                        lockData.is_locked = true;
                        this.logDebug('Found lock amount', { lock_amount: lockAmount, tx_id: tx?.id || 'unknown' });
                    }
                    continue;
                }
                
                // Check for lock duration
                if (item.startsWith('lock_duration=') || item.startsWith('lockDuration=')) {
                    const valueStr = item.includes('lock_duration=') ? 
                        item.replace('lock_duration=', '') : 
                        item.replace('lockDuration=', '');
                    const lockDuration = parseInt(valueStr, 10);
                    if (!isNaN(lockDuration)) {
                        lockData.lock_duration = lockDuration;
                        this.logDebug('Found lock duration', { lock_duration: lockDuration, tx_id: tx?.id || 'unknown' });
                    }
                    continue;
                }

                // Process key-value pairs
                if (item.includes('=')) {
                    const parts = item.split('=');
                    if (parts.length === 2) {
                        const key = this.normalizeKey(parts[0]);
                        const value = parts[1];
                        this.process_key_value_pair(key, value, lockData);
                    }
                }
            }

            // Extract tags
            const tags = extract_tags(data);
            if (tags.length > 0) {
                lockData.tags = [...(lockData.tags || []), ...tags];
            }

            // Set post ID
            lockData.post_id = tx.id || '';
            // Also set post_txid to match post_id (transaction ID)
            lockData.post_txid = tx.id || '';

            // Merge lockData into metadata
            Object.assign(metadata, lockData);

            // Return the extracted data
            // Log the final extracted data
            this.logInfo('Successfully extracted Lock protocol data', { 
                tx_id: tx?.id || 'unknown',
                is_vote: lockData.is_vote,
                is_locked: lockData.is_locked,
                has_content: !!lockData.content && lockData.content.length > 0,
                content_length: lockData.content ? lockData.content.length : 0,
                tag_count: lockData.tags ? lockData.tags.length : 0
            });
            
            return metadata;
        } catch (error) {
            this.logError('Error extracting Lock protocol data', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Process key-value pair from transaction data
     * @param key The key from the key-value pair
     * @param value The value from the key-value pair
     * @param metadata The metadata object to update
     */
    private process_key_value_pair(key: string, value: string, metadata: Record<string, any>): void {
        this.logDebug('Processing key-value pair', { key, value_preview: value.substring(0, 30) + (value.length > 30 ? '...' : ''), tx_id: metadata.post_id || 'unknown' });
        
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
                
            default:
                // Store other key-value pairs
                metadata[key] = value;
                break;
        }
    }
}
