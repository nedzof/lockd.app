import { logger } from '../utils/logger.js';
import { DbClient } from './dbClient.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { LockProtocolData, ParsedTransaction } from '../shared/types.js';

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

// Helper function to extract vote data from transactions
export function extractVoteData(tx: { data: string[] }): { 
    question?: string, 
    options?: { text: string, lock_amount: number, lock_duration: number, option_index: number }[],
    total_options?: number,
    options_hash?: string
} {
    try {
        const voteData: { 
            question?: string, 
            options?: { text: string, lock_amount: number, lock_duration: number, option_index: number }[],
            total_options?: number,
            options_hash?: string
        } = {};

        // Check if this is a vote transaction
        const is_vote_question = tx.data.some((d: string) => d.startsWith('type=vote_question'));
        const is_vote_option = tx.data.some((d: string) => d.startsWith('type=vote_option'));
        const is_vote_type = tx.data.some((d: string) => d.startsWith('content_type=vote'));
        
        if (!is_vote_question && !is_vote_option && !is_vote_type) {
            return {};
        }
        
        // Extract vote question
        if (is_vote_question) {
            const questionContent = tx.data.find((d: string) => d.startsWith('content='))?.split('=')[1];
            if (questionContent) {
                voteData.question = questionContent;
            }
        }
        
        // Extract total options
        if (is_vote_question) {
            const totalOptionsStr = tx.data.find((d: string) => d.startsWith('totaloptions='))?.split('=')[1];
            if (totalOptionsStr) {
                voteData.total_options = parseInt(totalOptionsStr, 10);
            }
            
            const optionsHash = tx.data.find((d: string) => d.startsWith('optionshash='))?.split('=')[1];
            if (optionsHash) {
                voteData.options_hash = optionsHash;
            }
        }
        
        // Extract vote options
        if (is_vote_option) {
            const optionIndices = tx.data.filter((d: string) => d.startsWith('optionindex=')).map((d: string) => parseInt(d.split('=')[1]));
            
            // Extract option text
            const optionTexts = tx.data
                .filter((d: string) => d.startsWith('content='))
                .map((d: string) => d.split('=')[1]);
            
            voteData.options = optionIndices.map((index: number) => ({
                text: optionTexts[0] || '',
                lock_amount: parseInt(tx.data.find((d: string) => d.startsWith('lock_amount='))?.split('=')[1] || '0'),
                lock_duration: parseInt(tx.data.find((d: string) => d.startsWith('lock_duration='))?.split('=')[1] || '0'),
                option_index: index
            }));
        }
        
        return voteData;
    } catch (error) {
        return {};
    }
}

export class TransactionParser {
    private dbClient: DbClient;
    private jungleBus: JungleBusClient;

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
            await this.dbClient.saveImage({
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
        logger.debug('🔍 ENTERING extractLockProtocolData', { 
            dataLength: data.length,
            txId: tx?.id || 'unknown'
        });
        
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
        
        logger.debug('🏗️ Created initial metadata structure', {
            metadata: JSON.stringify(metadata)
        });
        
        try {
            // Log the raw data we're processing
            logger.debug('🔍 PROCESSING RAW DATA', { 
                dataLength: data.length,
                dataType: typeof data,
                isArray: Array.isArray(data),
                firstFewItems: data.slice(0, 10)
            });

            // Check if this is a LOCK protocol transaction
            // We need to check if any string in the data array contains the app=lockd.app substring
            // The data is in hex format, so we need to check for both text and hex representation
            const isLockApp = data.some(item => {
                if (typeof item !== 'string') return false;
                
                // Check for plain text representation
                if (item.includes('app=lockd.app')) return true;
                
                // Check for hex representation (convert to ASCII and check)
                try {
                    // For hex strings that might contain binary data
                    const decoded = Buffer.from(item, 'hex').toString();
                    return decoded.includes('app=lockd.app') || decoded.includes('lockd.app');
                } catch (e) {
                    // If decoding fails, it's not a valid hex string
                    return false;
                }
            });
            
            logger.debug('🔍 Checking for LOCK protocol', { 
                isLockApp,
                firstFewItems: data.slice(0, 5)
            });

            if (!isLockApp) {
                logger.debug('❌ Not a LOCK protocol transaction');
                return null;
            }

            logger.info('✅ Found LOCK protocol transaction');

            // Extract fields from the data
            try {
                // Log the entire data array for debugging
                logger.debug('📊 FULL DATA ARRAY FOR EXTRACTION', {
                    dataLength: data.length,
                    fullData: JSON.stringify(data).substring(0, 1000) // Limit the string length
                });
                
                // First, try to find a single data item that contains most of the metadata
                // This handles the case where the data is in a single hex-encoded string
                let foundCompleteMetadata = false;
                
                for (const item of data) {
                    if (typeof item !== 'string') continue;
                    
                    try {
                        // Try to decode the hex string
                        const decoded = Buffer.from(item, 'hex').toString();
                        
                        // Log the decoded content for debugging
                        logger.debug('🔍 DECODED HEX STRING', {
                            originalLength: item.length,
                            decodedLength: decoded.length,
                            decodedSample: decoded.substring(0, 200)
                        });
                        
                        // Check if this contains key metadata fields
                        if (decoded.includes('app\tlockd.app') || 
                            decoded.includes('content') || 
                            decoded.includes('is_vote') ||
                            decoded.includes('is_locked')) {
                            
                            logger.debug('✅ Found metadata-rich item', {
                                decodedSample: decoded.substring(0, 200)
                            });
                            
                            // Process tab-separated key-value pairs
                            const tabPairs = decoded.split('\t');
                            let foundTabSeparatedPairs = false;
                            
                            if (tabPairs.length > 1) {
                                foundTabSeparatedPairs = true;
                            }
                            for (let i = 0; i < tabPairs.length; i++) {
                                const pair = tabPairs[i];
                                
                                // Check if this pair contains embedded key-value pairs
                                if (pair.includes('\u0007')) {
                                    const embeddedPairs = pair.split('\u0007');
                                    for (let j = 0; j < embeddedPairs.length; j++) {
                                        const embeddedPair = embeddedPairs[j];
                                        if (embeddedPair.length === 0) continue;
                                        
                                        // Handle the case where the first part might be a value from the previous key
                                        if (j === 0 && i > 0) {
                                            // This is a value for the previous key
                                            const prevKey = tabPairs[i-1].split('\u0007').pop() || tabPairs[i-1];
                                            if (prevKey && prevKey.length > 0) {
                                                const normalizedPrevKey = prevKey
                                                    .replace(/([A-Z])/g, '_$1')
                                                    .toLowerCase()
                                                    .replace(/^_/, '');
                                                
                                                logger.debug('🔑 Found embedded value for previous key', {
                                                    key: normalizedPrevKey,
                                                    value: embeddedPair
                                                });
                                                
                                                this.processKeyValuePair(normalizedPrevKey, embeddedPair, metadata);
                                            }
                                        } else if (embeddedPair.includes('=')) {
                                            // This is a key=value pair
                                            const [embeddedKey, embeddedValue] = embeddedPair.split('=');
                                            if (embeddedKey && embeddedKey.length > 0) {
                                                const normalizedEmbeddedKey = embeddedKey
                                                    .replace(/([A-Z])/g, '_$1')
                                                    .toLowerCase()
                                                    .replace(/^_/, '');
                                                
                                                logger.debug('🔑 Found embedded key-value pair', {
                                                    key: normalizedEmbeddedKey,
                                                    value: embeddedValue
                                                });
                                                
                                                this.processKeyValuePair(normalizedEmbeddedKey, embeddedValue, metadata);
                                            }
                                        } else if (j < embeddedPairs.length - 1) {
                                            // This is likely a key with the next item being its value
                                            const embeddedKey = embeddedPair;
                                            const embeddedValue = embeddedPairs[j+1];
                                            
                                            if (embeddedKey && embeddedKey.length > 0) {
                                                const normalizedEmbeddedKey = embeddedKey
                                                    .replace(/([A-Z])/g, '_$1')
                                                    .toLowerCase()
                                                    .replace(/^_/, '');
                                                
                                                logger.debug('🔑 Found embedded key with next value', {
                                                    key: normalizedEmbeddedKey,
                                                    value: embeddedValue
                                                });
                                                
                                                this.processKeyValuePair(normalizedEmbeddedKey, embeddedValue, metadata);
                                                j++; // Skip the next item as we've used it as a value
                                            }
                                        }
                                    }
                                } else if (pair.includes('=')) {
                                    const [key, value] = pair.split('=');
                                    if (!key) continue;
                                    
                                    logger.debug('🔑 Found tab-separated key-value pair', {
                                        key,
                                        value
                                    });
                                    
                                    // Normalize the key (camelCase to snake_case)
                                    const normalizedKey = key
                                        .replace(/([A-Z])/g, '_$1')
                                        .toLowerCase()
                                        .replace(/^_/, '');
                                    
                                    // Check if value contains control characters that might separate additional key-value pairs
                                    if (value.match(/[\x00-\x1F]/)) {
                                        // Split the value by control characters
                                        const subPairs = value.split(/[\x00-\x1F]/).filter(Boolean);
                                        
                                        // Process the first part as the value for the current key
                                        if (normalizedKey === 'app' && subPairs[0] === 'lockd.app') {
                                            // Special handling for app=lockd.app
                                            // Process the rest of the subPairs as potential key-value pairs
                                            for (let i = 1; i < subPairs.length; i += 2) {
                                                if (i + 1 < subPairs.length) {
                                                    const subKey = subPairs[i];
                                                    const subValue = subPairs[i + 1];
                                                    
                                                    logger.debug('🔑 Found sub key-value pair', {
                                                        key: subKey,
                                                        value: subValue
                                                    });
                                                    
                                                    // Normalize the sub key
                                                    const normalizedSubKey = subKey
                                                        .replace(/([A-Z])/g, '_$1')
                                                        .toLowerCase()
                                                        .replace(/^_/, '');
                                                    
                                                    // Process the sub key-value pair
                                                    this.processKeyValuePair(normalizedSubKey, subValue, metadata);
                                                }
                                            }
                                        } else {
                                            // For other keys, just use the first part as the value
                                            this.processKeyValuePair(normalizedKey, subPairs[0], metadata);
                                        }
                                    } else {
                                        // Process the key-value pair normally
                                        this.processKeyValuePair(normalizedKey, value, metadata);
                                    }
                                }
                            }
                            
                            // If we found tab-separated pairs, we can skip the segment processing
                            if (!foundTabSeparatedPairs) {
                                // Split the string by common control characters that might separate fields
                                const segments = decoded.split(/[\x00-\x1F]/).filter(Boolean);
                                
                                logger.debug('🔍 Extracted segments from decoded string', {
                                    segmentCount: segments.length,
                                    segments: segments.slice(0, 20)
                                });
                                
                                // Process segments to find key-value pairs
                                for (let i = 0; i < segments.length - 1; i++) {
                                    const potentialKey = segments[i];
                                    const potentialValue = segments[i + 1];
                                    
                                    // Skip segments that are likely not keys
                                    if (potentialKey.includes('SET') || 
                                        potentialKey.includes('ord') || 
                                        potentialKey.length > 20 ||
                                        potentialKey.match(/[^a-zA-Z0-9_]/)) {
                                        continue;
                                    }
                                    
                                    logger.debug('🔑 Potential key-value pair', {
                                        key: potentialKey,
                                        value: potentialValue
                                    });
                                    
                                    // Normalize the key (camelCase to snake_case)
                                    const normalizedKey = potentialKey
                                        .replace(/([A-Z])/g, '_$1')
                                        .toLowerCase()
                                        .replace(/^_/, '');
                                    
                                    // Process the key-value pair
                                    this.processKeyValuePair(normalizedKey, potentialValue, metadata);
                                }
                            }
                            
                            // Check if we found enough metadata to consider this complete
                            if (metadata.post_id || metadata.content) {
                                foundCompleteMetadata = true;
                                
                                logger.debug('✅ Successfully extracted metadata', {
                                    metadata: JSON.stringify(metadata).substring(0, 500)
                                });
                                
                                break;
                            }
                        }
                    } catch (e) {
                        // If decoding fails, continue to the next item
                        logger.debug('❌ Failed to decode hex string', {
                            error: e instanceof Error ? e.message : 'Unknown error'
                        });
                    }
                }
                
                logger.debug('📊 METADATA EXTRACTION RESULT', {
                    foundCompleteMetadata,
                    extractedMetadata: JSON.stringify(metadata).substring(0, 500)
                });
                
                // If we didn't find complete metadata, fall back to the original extraction method
                if (!foundCompleteMetadata) {
                    // Original extraction logic
                    for (const item of data) {
                        if (typeof item !== 'string') continue;
                        
                        // Try to decode if it looks like hex
                        let processedItem = item;
                        if (/^[0-9a-fA-F]+$/.test(item)) {
                            try {
                                processedItem = Buffer.from(item, 'hex').toString();
                            } catch (e) {
                                // If decoding fails, use the original string
                            }
                        }
                        
                        // Check if it's a key-value pair
                        if (processedItem.includes('=')) {
                            const [key, value] = processedItem.split('=');
                            if (!key) continue;
                            
                            logger.debug('🔑 Found key-value pair in fallback method', {
                                key,
                                value
                            });
                            
                            // Process the key-value pair
                            this.processKeyValuePair(key.toLowerCase(), value, metadata);
                        }
                    }
                }

                // Handle image data
                if (metadata.image_metadata.is_image && tx.transaction) {
                    try {
                        // Get raw transaction data
                        const buffer = Buffer.from(tx.transaction, 'base64');
                        
                        // Find image data markers based on content type
                        let imageBuffer: Buffer | null = null;
                        
                        if (metadata.image_metadata.content_type?.includes('jpeg') || metadata.image_metadata.content_type?.includes('jpg')) {
                            // Look for JPEG marker (FF D8 FF)
                            const jpegMarker = Buffer.from([0xFF, 0xD8, 0xFF]);
                            for (let i = 0; i < buffer.length - jpegMarker.length; i++) {
                                if (buffer[i] === jpegMarker[0] && 
                                    buffer[i + 1] === jpegMarker[1] && 
                                    buffer[i + 2] === jpegMarker[2]) {
                                    imageBuffer = buffer.slice(i);
                                    break;
                                }
                            }
                        } else if (metadata.image_metadata.content_type?.includes('png')) {
                            // Look for PNG marker (89 50 4E 47)
                            const pngMarker = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
                            for (let i = 0; i < buffer.length - pngMarker.length; i++) {
                                if (buffer[i] === pngMarker[0] && 
                                    buffer[i + 1] === pngMarker[1] && 
                                    buffer[i + 2] === pngMarker[2] && 
                                    buffer[i + 3] === pngMarker[3]) {
                                    imageBuffer = buffer.slice(i);
                                    break;
                                }
                            }
                        } else if (metadata.image_metadata.content_type?.includes('gif')) {
                            // Look for GIF marker (47 49 46 38)
                            const gifMarker = Buffer.from([0x47, 0x49, 0x46, 0x38]);
                            for (let i = 0; i < buffer.length - gifMarker.length; i++) {
                                if (buffer[i] === gifMarker[0] && 
                                    buffer[i + 1] === gifMarker[1] && 
                                    buffer[i + 2] === gifMarker[2] && 
                                    buffer[i + 3] === gifMarker[3]) {
                                    imageBuffer = buffer.slice(i);
                                    break;
                                }
                            }
                        }

                        if (imageBuffer) {
                            metadata.image = imageBuffer;
                            metadata.image_metadata = {
                                content_type: metadata.image_metadata.content_type || 'image/jpeg',
                                filename: metadata.image_metadata.filename || `image.${metadata.image_metadata.format || 'jpg'}`,
                                width: metadata.image_metadata.width,
                                height: metadata.image_metadata.height,
                                size: metadata.image_metadata.size,
                                encoding: 'binary'
                            };
                            logger.debug('Successfully extracted image data', {
                                size: metadata.image.length,
                                metadata: metadata.image_metadata
                            });
                        } else {
                            logger.warn('Could not find image data markers in transaction', {
                                content_type: metadata.image_metadata.content_type
                            });
                        }
                    } catch (error) {
                        logger.error('Failed to process image data', {
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }

                // For vote questions, collect all content items after the first one as options
                if (metadata.is_vote) {
                    const contents = data
                        .filter(item => item.startsWith('content='))
                        .map(item => item.split('=')[1]);
                    
                    if (contents.length > 1) {
                        metadata.vote_options = contents.slice(1);
                        logger.debug('Found vote options', { 
                            count: metadata.vote_options.length,
                            options: metadata.vote_options
                        });
                    }
                }

                // Validate required fields
                if (!metadata.content && !metadata.image) {
                    logger.debug('Missing required content', {
                        has_content: !!metadata.content,
                        has_image: !!metadata.image
                    });
                    return null;
                }

                return metadata;
            } catch (error) {
                logger.error('Failed to extract LOCK protocol data', { 
                    error: error instanceof Error ? {
                        message: error.message,
                        stack: error.stack
                    } : error
                });
                return null;
            }
        } catch (error) {
            logger.error('Failed to extract LOCK protocol data', { 
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error
            });
            return null;
        }
    }

    private extractVoteData(data: any[], tx: any): LockProtocolData | null {
        try {
            // Initialize metadata structure with default values
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
            
            logger.debug('🏗️ Created initial metadata structure', {
                metadata: JSON.stringify(metadata)
            });
            
            // Log the full data array for debugging
            logger.debug('📊 FULL DATA ARRAY FOR EXTRACTION', {
                dataLength: data.length,
                fullData: JSON.stringify(data).substring(0, 1000)
            });
            
            // First, check for vote-specific data
            for (const item of data) {
                if (typeof item !== 'string') continue;
                
                // Check for vote options
                if (item.includes('vote_options=') || item.includes('voteOptions=')) {
                    try {
                        const optionsMatch = item.match(/vote_options=(\[.*?\])|voteOptions=(\[.*?\])/);
                        if (optionsMatch && (optionsMatch[1] || optionsMatch[2])) {
                            const optionsJson = optionsMatch[1] || optionsMatch[2];
                            metadata.vote_options = JSON.parse(optionsJson);
                            metadata.is_vote = true;
                            logger.debug('✅ Found vote options', {
                                count: metadata.vote_options.length,
                                options: metadata.vote_options
                            });
                        }
                    } catch (e) {
                        logger.debug('❌ Failed to parse vote options', {
                            error: e instanceof Error ? e.message : 'Unknown error'
                        });
                    }
                }
                
                // Check for vote question
                if (item.includes('vote_question=') || item.includes('voteQuestion=')) {
                    try {
                        const questionMatch = item.match(/vote_question="(.*?)"|voteQuestion="(.*?)"/);
                        if (questionMatch && (questionMatch[1] || questionMatch[2])) {
                            metadata.vote_question = questionMatch[1] || questionMatch[2];
                            metadata.is_vote = true;
                            logger.debug('✅ Found vote question', {
                                question: metadata.vote_question
                            });
                        }
                    } catch (e) {
                        logger.debug('❌ Failed to parse vote question', {
                            error: e instanceof Error ? e.message : 'Unknown error'
                        });
                    }
                }
                
                // Check for is_vote flag
                if (item.includes('is_vote=true') || item.includes('isVote=true')) {
                    metadata.is_vote = true;
                    logger.debug('✅ Found is_vote flag');
                }
                
                // Check for content_type=vote
                if (item.includes('content_type=vote') || item.includes('content_type=vote')) {
                    metadata.is_vote = true;
                    logger.debug('✅ Found content_type=vote');
                }
            }
            
            // If we found vote options or question, return the metadata
            if (metadata.vote_options || metadata.vote_question) {
                return metadata;
            }
            
            // If we didn't find any vote-specific data, return null
            return null;
        } catch (error) {
            logger.error('Failed to extract vote data', { 
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    // Helper function to process key-value pairs
    private processKeyValuePair(key: string, value: string, metadata: LockProtocolData): void {
        switch (key) {
            case 'app':
                // Already verified this is lockd.app
                break;
            case 'content':
                metadata.content = value;
                break;
            case 'post_id':
            case 'postid':
                metadata.post_id = value;
                break;
            case 'is_vote':
            case 'isvote':
                metadata.is_vote = value.toLowerCase() === 'true';
                break;
            case 'is_locked':
            case 'islocked':
                metadata.is_locked = value.toLowerCase() === 'true';
                break;
            case 'lock_amount':
            case 'lockamount':
                metadata.lock_amount = parseInt(value, 10) || 0;
                break;
            case 'lock_duration':
            case 'lockduration':
                metadata.lock_duration = parseInt(value, 10) || 0;
                break;
            case 'vote_question':
            case 'votequestion':
                metadata.vote_question = value;
                metadata.is_vote = true; // If we have a vote question, it's a vote
                break;
            case 'options_hash':
            case 'optionshash':
                metadata.options_hash = value;
                break;
            case 'total_options':
            case 'totaloptions':
                metadata.total_options = parseInt(value, 10) || 0;
                break;
            case 'vote_options':
            case 'voteoptions':
                try {
                    // Try to parse as JSON array
                    if (value.startsWith('[') && value.endsWith(']')) {
                        metadata.vote_options = JSON.parse(value);
                    } else {
                        // If not a JSON array, split by commas
                        metadata.vote_options = value.split(',').map(opt => opt.trim());
                    }
                    metadata.is_vote = true; // If we have vote options, it's a vote
                    
                    logger.debug('✅ Processed vote options', {
                        count: metadata.vote_options.length,
                        options: metadata.vote_options
                    });
                } catch (e) {
                    logger.error('❌ Failed to parse vote options', {
                        error: e instanceof Error ? e.message : 'Unknown error',
                        value
                    });
                }
                break;
            case 'sequence':
                // This might be useful for ordering
                break;
            case 'parent_sequence':
            case 'parentsequence':
                // This might indicate a reply
                break;
            case 'content_type':
            case 'content_type':
                metadata.content_type = value;
                if (value === 'vote') {
                    metadata.is_vote = true;
                }
                break;
            default:
                // Store any other key-value pairs in the metadata
                logger.debug('🔄 Storing unknown key-value pair', { key, value });
                (metadata as any)[key] = value;
                break;
        }
    }

    public async parseTransaction(tx_id: string): Promise<void> {
        try {
            if (!tx_id || typeof tx_id !== 'string') {
                logger.error('Invalid transaction ID', { tx_id });
                return;
            }

            // Check if transaction already exists in database
            const existingTx = await this.dbClient.getTransaction(tx_id);
            if (existingTx) {
                logger.info('📋 TRANSACTION ALREADY PROCESSED', { tx_id });
                return;
            }

            logger.info('🔄 PARSING TRANSACTION', { tx_id });

            const tx: any = await this.jungleBus.GetTransaction(tx_id);
            if (!tx) {
                logger.warn('Transaction not found in JungleBus', { tx_id });
                return;
            }

            // Log the raw transaction data structure to understand its format
            logger.debug('📦 RAW TRANSACTION DATA', { 
                tx_id,
                hasOutputs: !!tx.outputs,
                outputsLength: tx.outputs?.length || 0,
                outputsType: tx.outputs ? typeof tx.outputs : 'undefined',
                firstFewOutputs: tx.outputs?.slice(0, 5) || [],
                txStructure: Object.keys(tx),
                dataType: tx.data ? typeof tx.data : 'undefined',
                dataLength: tx.data?.length || 0,
                addresses: tx.addresses
            });

            // For JungleBus JSON protocol, we need to handle the data differently
            // than for the protobuf protocol
            const txData = tx.outputs || [];
            
            // Log the txData before processing
            logger.debug('🔍 TX DATA BEFORE PROCESSING', {
                txDataType: typeof txData,
                isArray: Array.isArray(txData),
                txDataLength: txData.length,
                sampleData: txData.slice(0, 3)
            });
            
            // First try to extract regular Lock protocol data
            const parsedTx = this.extractLockProtocolData(txData, tx);
            
            // If that fails, try to extract vote-specific data
            const voteData = this.extractVoteData(txData, tx);
            
            // Combine the data if both are available
            let finalParsedTx = parsedTx;
            if (voteData) {
                if (!finalParsedTx) {
                    finalParsedTx = voteData;
                } else {
                    // Merge vote data into parsed data
                    finalParsedTx.is_vote = true;
                    finalParsedTx.vote_options = voteData.vote_options || finalParsedTx.vote_options;
                    finalParsedTx.vote_question = voteData.vote_question || finalParsedTx.vote_question;
                }
            }
            
            if (!finalParsedTx) {
                logger.warn('Not a Lock protocol transaction', { tx_id });
                return;
            }

            logger.info('✅ TRANSACTION PARSED', { 
                tx_id,
                has_image: !!finalParsedTx.image,
                has_vote_options: !!(finalParsedTx.vote_options && finalParsedTx.vote_options.length > 0),
                parsedTxKeys: Object.keys(finalParsedTx)
            });

            if (finalParsedTx.image) {
                await this.processImage(finalParsedTx.image, finalParsedTx.image_metadata, tx_id);
            }

            // Determine transaction type
            let txType = 'lock';
            if (finalParsedTx.is_vote || (finalParsedTx.vote_options && finalParsedTx.vote_options.length > 0) || finalParsedTx.content_type === 'vote') {
                txType = 'vote';
                
                // Ensure we have vote options
                if (!finalParsedTx.vote_options || finalParsedTx.vote_options.length === 0) {
                    // Create default vote options if none exist
                    logger.info('Creating default vote options for vote', { tx_id });
                    finalParsedTx.vote_options = ['Yes', 'No', 'Maybe'];
                }
            }

            // Create the parsed transaction object to send to the database
            const parsedTransaction: ParsedTransaction = {
                tx_id,
                type: txType,
                protocol: 'LOCK',
                block_height: tx.block_height, // Use snake_case for consistency
                block_time: tx.block_time,     // Use snake_case for consistency
                metadata: {
                    post_id: finalParsedTx.post_id,
                    content: finalParsedTx.content,
                    lock_amount: finalParsedTx.lock_amount,
                    lock_duration: finalParsedTx.lock_duration,
                    vote_options: finalParsedTx.vote_options,
                    vote_question: finalParsedTx.vote_question,
                    image: finalParsedTx.image,
                    image_metadata: finalParsedTx.image_metadata,
                    options_hash: finalParsedTx.options_hash,
                    content_type: finalParsedTx.content_type,
                    tags: finalParsedTx.tags || [],
                    sender_address: tx.addresses?.[0] || null
                }
            };

            logger.info('📤 SENDING TO DATABASE', { 
                tx_id,
                type: txType,
                block_height: tx.block_height
            });

            // Process the transaction in the database
            const post = await this.dbClient.processTransaction(parsedTransaction);
            
            logger.info('💾 TRANSACTION SAVED', {
                tx_id,
                post_id: post.id,
                type: txType,
                vote_options_count: finalParsedTx.vote_options?.length || 0
            });
        } catch (error) {
            logger.error('❌ TRANSACTION PROCESSING FAILED', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}