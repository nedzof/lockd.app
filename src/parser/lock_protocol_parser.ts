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
            // Check if this is a LOCK protocol transaction
            const isLockApp = data.some(item => {
                if (typeof item !== 'string') return false;
                return item.includes('app=lockd.app') || 
                       (item.match(/^[0-9a-fA-F]+$/) && decode_hex_string(item).includes('app=lockd.app'));
            });
            
            if (!isLockApp) {
                this.logWarn('Not a Lock protocol transaction', { tx_id: tx?.id || 'unknown' });
                return null;
            }

            this.logInfo('Found LOCK protocol transaction', { tx_id: tx?.id || 'unknown' });

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
                if (item.startsWith('lock_amount=')) {
                    const lockAmount = parseInt(item.replace('lock_amount=', ''), 10);
                    if (!isNaN(lockAmount)) {
                        lockData.lock_amount = lockAmount;
                        lockData.is_locked = true;
                    }
                    continue;
                }
                
                // Check for lock duration
                if (item.startsWith('lock_duration=')) {
                    const lockDuration = parseInt(item.replace('lock_duration=', ''), 10);
                    if (!isNaN(lockDuration)) {
                        lockData.lock_duration = lockDuration;
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

            // Merge lockData into metadata
            Object.assign(metadata, lockData);

            // Return the extracted data
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
                const lockAmount = parseInt(value, 10);
                if (!isNaN(lockAmount)) {
                    metadata.lock_amount = lockAmount;
                    metadata.is_locked = true;
                }
                break;
                
            case 'lock_duration':
                const lockDuration = parseInt(value, 10);
                if (!isNaN(lockDuration)) {
                    metadata.lock_duration = lockDuration;
                }
                break;
                
            case 'is_vote':
            case 'isvote':
                metadata.is_vote = value.toLowerCase() === 'true';
                break;
                
            default:
                // Store other key-value pairs
                metadata[key] = value;
                break;
        }
    }
}
