import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';
import { MimeTypes, MAP, InscribeRequest } from 'yours-wallet-provider';
import { getFeeRate } from '../../shared/utils/whatsOnChain';
import { FiExternalLink } from 'react-icons/fi';
import { Post } from '../types/post';
import { getBsvAddress } from '../utils/walletConnectionHelpers';

// Define API base URL configuration
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3003';

// Base interfaces
export interface vote_option {
    text: string;
    lock_amount: number;
    lock_duration: number;
    optionIndex: number;
    feeSatoshis?: number;
}

export interface VoteData {
    is_vote_question: boolean;
    question?: string;
    options?: vote_option[];
    total_options?: number;
    options_hash?: string;
    selectedOption?: vote_option;
}

export interface ImageData {
    file: File;
    content_type: string;
    base64Data: string;
    description?: string;
    metadata?: {
        width: number;
        height: number;
        format: string;
        size: number;
    };
}

// Database-aligned interfaces
export interface DbPost {
    id: string;
    tx_id: string;
    post_id: string;
    content: string;
    author_address: string;
    media_type?: string;
    block_height?: number;
    amount?: number;
    unlock_height?: number;
    description?: string;
    created_at: Date;
    tags: string[];
    metadata?: Record<string, any>;
    is_locked: boolean;
    lock_duration?: number;
    raw_image_data?: string;
    image_format?: string;
    image_source?: string;
    is_vote: boolean;
    vote_options?: Dbvote_option[];
    scheduled_at?: Date;
}

export interface Dbvote_option {
    id: string;
    tx_id: string;
    content: string;
    author_address: string;
    created_at: Date;
    post_id: string;
    option_index: number;
    tags: string[];
}

// Main metadata interface
export interface PostMetadata {
    app: string;
    type: string;
    content: string;
    timestamp: string;
    version: string;
    tags: string[];
    sequence: number;
    parentSequence?: number;
    post_id: string;
    block_height?: number;
    amount?: number;
    unlock_height?: number;
    is_locked: boolean;
    lock_duration?: number;
    is_vote: boolean;
    scheduled?: {
        scheduledAt: string;
        timezone: string;
    };
    vote?: {
        is_vote_question: boolean;
        question?: string;
        options?: Array<{
            text: string;
            lock_amount: number;
            lock_duration: number;
            optionIndex: number;
            unlock_height?: number;
            currentHeight?: number;
            lockPercentage?: number;
            feeSatoshis?: number;
        }>;
        total_options?: number;
        options_hash?: string;
        optionIndex?: number;
        optionText?: string;
        lock_amount?: number;
        lock_duration?: number;
    };
    image?: {
        file: File;
        content_type: string;
        base64Data: string;
        format: string;
        source?: string;
        description?: string;
        metadata?: {
            width: number;
            height: number;
            format: string;
            size: number;
        };
    };
}

// Helper function to convert PostMetadata to database Post object
export function createDbPost(metadata: PostMetadata, tx_id: string): DbPost {
    const post: DbPost = {
        id: tx_id,
        tx_id,
        post_id: metadata.post_id || tx_id,
        content: metadata.content,
        author_address: '', // This will be set by the caller
        created_at: new Date(metadata.timestamp),
        tags: metadata.tags,
        is_locked: metadata.is_locked,
        lock_duration: metadata.lock_duration,
        is_vote: metadata.is_vote,
        metadata: {
            app: metadata.app,
            type: metadata.type,
            version: metadata.version,
            sequence: metadata.sequence,
            parentSequence: metadata.parentSequence
        }
    };

    // Ensure post.metadata is initialized as an object
    if (!post.metadata) {
        post.metadata = {};
    }

    // Ensure scheduled metadata is properly copied to the database post metadata
    if (metadata.scheduled) {
        post.metadata.scheduled = metadata.scheduled;
        post.scheduled_at = new Date(metadata.scheduled.scheduledAt);
        console.log('Added scheduled metadata to post:', post.metadata.scheduled);
        console.log('Added scheduled_at field:', post.scheduled_at);
    }

    if (metadata.block_height) {
        post.block_height = metadata.block_height;
    }

    if (metadata.amount) {
        post.amount = metadata.amount;
    }

    if (metadata.unlock_height) {
        post.unlock_height = metadata.unlock_height;
    }

    // Handle vote data
    if (metadata.is_vote && metadata.vote) {
        post.metadata.vote = {
            is_vote_question: metadata.vote.is_vote_question,
            question: metadata.vote.question || metadata.content,
            total_options: metadata.vote.total_options || (metadata.vote.options?.length || 0)
        };

        // Store vote options in the post metadata
        if (metadata.vote.options && metadata.vote.options.length > 0) {
            post.metadata.vote.options = metadata.vote.options.map(option => ({
                text: option.text,
                lock_amount: option.lock_amount,
                lock_duration: option.lock_duration,
                optionIndex: option.optionIndex
            }));
        }

        if (metadata.vote.options_hash) {
            post.metadata.vote.options_hash = metadata.vote.options_hash;
        }
    }

    // Handle image data
    if (metadata.image) {
        post.media_type = metadata.image.content_type;
        post.image_format = metadata.image.format;
        post.image_source = metadata.image.source;
        post.description = metadata.image.description;
        if (metadata.image.base64Data) {
            post.raw_image_data = metadata.image.base64Data;
        }

        // Add image metadata
        if (metadata.image.metadata) {
            post.metadata.image = {
                width: metadata.image.metadata.width,
                height: metadata.image.metadata.height,
                format: metadata.image.metadata.format,
                size: metadata.image.metadata.size
            };
        }
    }

    return post;
}

// Helper function to convert PostMetadata to database vote_option objects
export function createDbvote_options(metadata: PostMetadata, post_tx_id: string): Dbvote_option[] {
    if (!metadata.vote?.options) {
        return [];
    }

    return metadata.vote.options.map((option, index) => ({
        id: `${post_tx_id}-option-${index}`,
        tx_id: `${post_tx_id}-option-${option.optionIndex}`, // Generate unique tx_id
        content: option.text,
        author_address: '', // This will be set by the caller
        created_at: new Date(metadata.timestamp),
        post_id: post_tx_id,
        option_index: option.optionIndex,
        tags: metadata.tags
    }));
}

// Create MAP data from metadata
function createMapData(metadata: PostMetadata): MAP {
    // Create a flat metadata structure for easier parsing
    const mapData: Record<string, string> = {
        app: 'lockd.app',
        type: metadata.type || 'content',
        content: metadata.content || '',
        timestamp: metadata.timestamp || new Date().toISOString(),
        version: metadata.version || '1.0.0',
        tags: JSON.stringify(metadata.tags || []),
        is_locked: (metadata.is_locked !== undefined ? metadata.is_locked : false).toString(),
        is_vote: (metadata.is_vote !== undefined ? metadata.is_vote : false).toString()
    };

    // Add post_id if available
    if (metadata.post_id) {
        mapData.post_id = metadata.post_id;
    }

    // Add sequence information
    if (metadata.sequence !== undefined) {
        mapData.sequence = metadata.sequence.toString();
    }
    
    if (metadata.parentSequence !== undefined) {
        mapData.parent_sequence = metadata.parentSequence.toString();
    }

    // Add block and lock information if available
    if (metadata.block_height !== undefined) {
        mapData.block_height = metadata.block_height.toString();
    }

    if (metadata.amount !== undefined) {
        mapData.amount = metadata.amount.toString();
    }

    if (metadata.unlock_height !== undefined) {
        mapData.unlock_height = metadata.unlock_height.toString();
    }

    if (metadata.lock_duration !== undefined) {
        mapData.lock_duration = metadata.lock_duration.toString();
    }

    // Add scheduling information if present
    if (metadata.scheduled) {
        mapData.scheduled_at = metadata.scheduled.scheduledAt;
        mapData.timezone = metadata.scheduled.timezone;
    }

    // Handle vote data - consolidate into a single field for easier parsing
    if (metadata.is_vote === true && metadata.vote) {
        // For vote questions
        if (metadata.vote.is_vote_question || metadata.vote.options) {
            // Pack all vote data in a serialized format
            const voteData = {
                question: metadata.vote.question || metadata.content,
                options: metadata.vote.options?.map(opt => ({
                    text: opt.text,
                    lock_amount: opt.lock_amount,
                    lock_duration: opt.lock_duration,
                    optionIndex: opt.optionIndex
                })) || [],
                total_options: metadata.vote.options?.length || metadata.vote.total_options || 0
            };
            
            // Include vote options directly in the map data to avoid having to create separate transactions
            mapData.vote_data = JSON.stringify(voteData);
            
            // Add these as direct fields too for backward compatibility and scanner optimization
            mapData.type = 'vote_question';
            mapData.is_vote = 'true';
            mapData.content_type = 'vote';
            
            if (metadata.vote.question) {
                mapData.vote_question = metadata.vote.question;
            }
            
            if (metadata.vote.total_options !== undefined) {
                mapData.total_options = metadata.vote.total_options.toString();
            }
            
            if (metadata.vote.options_hash) {
                mapData.options_hash = metadata.vote.options_hash;
            }
            
            // Add each option directly in the map data for easier parsing by scanner
            if (metadata.vote.options && metadata.vote.options.length > 0) {
                metadata.vote.options.forEach((option, index) => {
                    mapData[`option${index}`] = option.text;
                    mapData[`option${index}_lock_amount`] = option.lock_amount.toString();
                    mapData[`option${index}_lock_duration`] = option.lock_duration.toString();
                });
            }
        }
        // For vote option selections
        else if (metadata.vote.optionIndex !== undefined) {
            mapData.optionIndex = metadata.vote.optionIndex.toString();
            
            if (metadata.vote.optionText) {
                mapData.optionText = metadata.vote.optionText;
            }
        }
    }

    // Handle image data
    if (metadata.image) {
        mapData.content_type = metadata.image.content_type || '';
        mapData.image_format = metadata.image.format || '';
        
        if (metadata.image.source) {
            mapData.image_source = metadata.image.source;
        }
        
        if (metadata.image.description) {
            mapData.description = metadata.image.description;
        }
        
        // Include image metadata in a consistent format
        if (metadata.image.metadata) {
            const imageMetadata = {
                width: metadata.image.metadata.width,
                height: metadata.image.metadata.height,
                size: metadata.image.metadata.size,
                format: metadata.image.metadata.format
            };
            mapData.image_metadata = JSON.stringify(imageMetadata);
        }
    }

    console.log(`[DEBUG] Final MAP data for ${metadata.type}:`, mapData);
    return mapData as MAP;
}

// Helper function to encode string to base64
function stringToBase64(str: string): string {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode(Number('0x' + p1));
        }));
}

// Helper function to create inscription request
function createInscriptionRequest(
    address: string,
    content: string,
    map: MAP,
    satoshis: number,
    mimeType: string = 'text/plain'
): InscribeRequest {
    console.log(`[DEBUG] Creating inscription request:`);
    console.log(`[DEBUG] - Address: ${address}`);
    console.log(`[DEBUG] - Content preview: ${content.substring(0, 20)}${content.length > 20 ? '...' : ''}`);
    console.log(`[DEBUG] - Map type: ${map.type}`);
    console.log(`[DEBUG] - Map tags: ${map.tags}`);
    console.log(`[DEBUG] - Satoshis: ${satoshis}`);
    console.log(`[DEBUG] - MIME type: ${mimeType}`);
    
    const request = {
        address,
        base64Data: mimeType.startsWith('image/') ? content : stringToBase64(content),
        mimeType: mimeType as MimeTypes,
        map,
        satoshis
    };
    
    return request;
}

// Create image component
async function createImageComponent(
    imageData: ImageData,
    post_id: string,
    sequence: number,
    parentSequence: number,
    address: string,
    tags: string[] = []
): Promise<InscribeRequest> {
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'image',
        content: imageData.description || '',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: tags,
        sequence,
        parentSequence,
        post_id,
        is_locked: false,
        is_vote: false,
        image: {
            ...imageData,
            format: imageData.metadata?.format || 'unknown'
        }
    };

    const map = createMapData(metadata);
    const satoshis = await calculateOutputSatoshis(imageData.base64Data.length);
    
    // Log the image component details for debugging
    console.log(`Creating image component with tags:`, tags);

    return createInscriptionRequest(
        address,
        imageData.base64Data,
        map,
        satoshis,
        imageData.content_type
    );
}

// Helper function to calculate output satoshis
async function calculateOutputSatoshis(contentSize: number, is_vote_options_packed: boolean = false): Promise<number> {
    // Get current fee rate from WhatsOnChain
    const feeRate = await getFeeRate();
    console.log(`Current fee rate: ${feeRate} sat/vbyte`);
    console.log(`Content size: ${contentSize} bytes`);
    
    // Base size for transaction overhead (P2PKH output, basic script)
    const baseTxSize = 250; // bytes
    
    // If we're packing vote options, account for additional data size
    let totalSize = baseTxSize + contentSize;
    if (is_vote_options_packed) {
        // Add extra size for the packed vote options
        // This is an estimate, actual size will vary based on option content
        totalSize = baseTxSize + contentSize + 500; // Add extra bytes for vote options data
        console.log(`Adjusted size for packed vote options: ${totalSize} bytes`);
    }
    
    // Calculate fee based on size and rate
    const calculatedFee = Math.ceil(totalSize * feeRate);
    console.log(`Calculated base fee: ${calculatedFee} satoshis`);
    
    // For vote with packed options, we need a more substantial output
    if (is_vote_options_packed) {
        // Use a more aggressive calculation for votes
        // Base value that scales with content length
        const baseValue = Math.max(contentSize * 150);
        console.log(`Base value (contentSize * 150): ${baseValue}`);
        
        // Scale based on fee rate too
        const feeMultiplier = Math.max(Math.ceil(feeRate / 0.5)); 
        const feeBasedValue = calculatedFee * feeMultiplier;
        console.log(`Fee-based value (calculatedFee * ${feeMultiplier}): ${feeBasedValue}`);
        
        // Ensure we have a good minimum value for the vote with options
        const recommendedVoteSats = Math.max(baseValue, feeBasedValue, 1); // At least 10000 sats
        
        console.log(`Final vote with packed options satoshis: ${recommendedVoteSats}`);
        return recommendedVoteSats;
    }
    
    // For regular content, ensure minimum dust limit
    return Math.max(calculatedFee);
}

// Helper function to hash content
async function hashContent(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper function to generate a unique post ID
function generatepost_id(): string {
    return [
        Date.now().toString(36),
        Math.random().toString(36).substr(2, 9)
    ].join('-').substr(0, 32);
}

// Helper function to get current block height
async function getCurrentblock_height(): Promise<number> {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    return data.blocks;
}

// Helper function to get image metadata and process image
async function processImage(file: File): Promise<{ base64Data: string; metadata: ImageData['metadata'] }> {
    return new Promise((resolve, reject) => {
        // Get original format from file type
        const format = file.type.split('/')[1].toLowerCase();
        
        // List of supported web formats
        const supportedWebFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'svg+xml', 'tiff'];
        
        // Keep original format if it's web-supported, otherwise use PNG
        let outputFormat = supportedWebFormats.includes(format) ? format : 'png';
        
        // Normalize format names for consistency
        if (outputFormat === 'svg+xml') outputFormat = 'svg';
        if (outputFormat === 'jpg') outputFormat = 'jpeg';
        
        // Create URL from file
        const url = URL.createObjectURL(file);
        
        // Create image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Could not get canvas context'));
            return;
        }
        
        // Wait for image to load
        img.onload = () => {
            try {
                // Calculate dimensions
                let width = img.width;
                let height = img.height;
                
                // Resize if needed (max 800px while maintaining aspect ratio)
                const maxSize = 800;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                
                // Set canvas size
                canvas.width = width;
                canvas.height = height;
                
                // Draw image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get base64 data
                const base64Data = canvas.toDataURL(`image/${outputFormat}`).split(',')[1];
                
                // Get file size
                const byteString = atob(base64Data);
                const size = byteString.length;
                
                // Cleanup
                URL.revokeObjectURL(url);
                
                resolve({
                    base64Data,
                    metadata: {
                        width,
                        height,
                        format: outputFormat,
                        size
                    }
                });
            } catch (error) {
                console.error('Error processing image:', error);
                URL.revokeObjectURL(url);
                reject(error);
            }
        };
        
        img.onerror = (error) => {
            console.error('Error loading image:', error);
            URL.revokeObjectURL(url);
            reject(error);
        };
        
        img.src = url;
    });
}

// Helper function to convert File to base64
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Main post creation function
export const createPost = async (
    wallet: any,
    content: string,
    imageData?: string | File,
    imageMimeType?: string,
    isVotePost: boolean = false,
    vote_options: string[] = [],
    scheduleInfo?: { scheduledAt: string; timezone: string },
    tags: string[] = [],
    lockSettings?: { is_locked: boolean; lock_amount: number; lock_duration: number }
): Promise<Post> => {
    const start_time = Date.now();
    const log_with_time = (message: string) => {
      const elapsed = Date.now() - start_time;
      console.log(`⏱️ [${elapsed}ms] ${message}`);
    };

    log_with_time('🔄 [PostService] Starting post creation process');
    if (!wallet) {
        throw new Error('Wallet is required');
    }

    // Log wallet state
    log_with_time('🔄 [PostService] Checking wallet capabilities');
    console.log('Wallet state:', {
        hasInscribe: typeof wallet.inscribe === 'function',
        methods: Object.keys(wallet).filter(key => typeof wallet[key] === 'function'),
        wallet_type: wallet?.constructor?.name || 'unknown'
    });

    // Get BSV address
    log_with_time('🔄 [PostService] Getting BSV address');
    const bsvAddress = await getBsvAddress(wallet);
        if (!bsvAddress) {
        throw new Error('Could not retrieve wallet address');
    }
    log_with_time('🔄 [PostService] Got BSV address: ' + bsvAddress.substring(0, 6) + '...');

    // Create a single post_id
    const post_id = generatepost_id();
    log_with_time('🔄 [PostService] Generated post_id: ' + post_id);

    // Show pending toast
    const pendingToast = toast.loading(scheduleInfo ? 'Scheduling post...' : 'Creating post...', {
        style: {
            background: '#1A1B23',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.375rem'
        }
    });

    try {
        // Validate vote post parameters
        if (isVotePost) {
            log_with_time('🔄 [PostService] Validating vote options: ' + vote_options.length);
            const validOptions = vote_options.filter(opt => opt.trim() !== '');
            if (validOptions.length < 2) {
                throw new Error('Vote posts require at least 2 valid options');
            }
        }

        // Create main content metadata
        log_with_time('🔄 [PostService] Creating post metadata');
        const metadata: PostMetadata = {
            app: 'lockd.app',
            type: isVotePost ? 'vote_question' : 'content',
            content,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            tags: tags || [],
            sequence: 1, // We're simplifying to a single component
            post_id,
            is_locked: !!lockSettings?.is_locked,
            lock_duration: lockSettings?.lock_duration,
            is_vote: isVotePost
        };

        // Add locking parameters if provided
        if (lockSettings?.is_locked && !isVotePost) {
            log_with_time('🔄 [PostService] Adding lock settings: ' + JSON.stringify(lockSettings));
            metadata.amount = lockSettings.lock_amount;
        }

        // Add scheduling information if provided
        if (scheduleInfo) {
            log_with_time('🔄 [PostService] Adding schedule info: ' + scheduleInfo.scheduledAt);
            metadata.scheduled = {
                scheduledAt: scheduleInfo.scheduledAt,
                timezone: scheduleInfo.timezone
            };
        }

        // Process image if provided
        if (imageData) {
            log_with_time('🔄 [PostService] Processing image data');
            try {
                let processedImage;
                let imageFile: File;
                
                // Handle different imageData types
                if (imageData instanceof File) {
                    imageFile = imageData;
                    log_with_time('🔄 [PostService] Image data is a File object');
                } else if (typeof imageData === 'string') {
                    log_with_time('🔄 [PostService] Image data is a string, converting to Blob');
                        const blob = dataURItoBlob(imageData);
                        imageFile = new File([blob], 'image.' + (blob.type.split('/')[1] || 'jpg'), { 
                            type: blob.type || imageMimeType || 'image/jpeg' 
                        });
                } else {
                    throw new Error('Invalid image data format');
                }
                
                // Process the image file to get base64 and metadata
                log_with_time('🔄 [PostService] Processing image to get base64 and metadata');
                const { base64Data, metadata: imageMetadata } = await processImage(imageFile);
                
                // Create an image data object
                const imageDataObj: ImageData = {
                    file: imageFile,
                    content_type: imageFile.type || imageMimeType || 'image/jpeg',
                    base64Data,
                    description: ''
                };
                
                // Add the image metadata
                imageDataObj.metadata = imageMetadata;
                
                metadata.image = {
                    ...imageDataObj,
                    format: imageMetadata?.format || 'png'
                };
                log_with_time('✅ [PostService] Image processing complete');
            } catch (imageError: any) {
                log_with_time('❌ [PostService] Error processing image: ' + imageError.message);
                toast.error(`Error processing image: ${imageError.message || 'Unknown error'}`, {
                    id: pendingToast
                });
                // Continue without the image
            }
        }

        // Handle vote post options
        if (isVotePost && vote_options.length >= 2) {
            log_with_time('🔄 [PostService] Processing vote options');
            const validOptions = vote_options.filter(opt => opt.trim() !== '');
            
            // Create vote options objects
            const vote_optionObjects: vote_option[] = validOptions.map((text, index) => ({
                        text,
                        lock_amount: 1000, // Base lock amount in satoshis
                        lock_duration: 144, // Default to 1 day (144 blocks)
                        optionIndex: index
            }));
            
            // Add vote data to metadata
            metadata.vote = {
                is_vote_question: true,
                question: content,
                options: vote_optionObjects,
                total_options: vote_optionObjects.length,
                options_hash: await hashContent(JSON.stringify(vote_optionObjects))
            };
            log_with_time('🔄 [PostService] Vote options processed: ' + vote_optionObjects.length);
        }

        // Create a single inscription request
        log_with_time('🔄 [PostService] Creating inscription request');
        const request = {
            address: bsvAddress,
            base64Data: metadata.image ? metadata.image.base64Data : stringToBase64(content),
            mimeType: metadata.image ? metadata.image.content_type : 'text/plain',
            map: createMapData(metadata),
            satoshis: await calculateOutputSatoshis(content.length, isVotePost)
        };
        log_with_time('🔄 [PostService] Inscription request created');

        // Send to wallet
        log_with_time('🔄 [PostService] Sending inscription to wallet');
        const response = await wallet.inscribe([request]);
        log_with_time('✅ [PostService] Inscription sent successfully');

        // Extract transaction ID
        log_with_time('🔄 [PostService] Analyzing wallet response for transaction ID');
        console.log('[DEBUG] Response analysis:');
        console.log('[DEBUG] - Response type:', typeof response);
        console.log('[DEBUG] - Response keys:', Object.keys(response));
        
        // Check for transaction ID in various formats
        const tx_id = response?.tx_id || response?.id || response?.txid || 
                     (response?.hash ? response.hash.toString() : null) ||
                     (typeof response === 'string' ? response : null);
                         
        if (!tx_id) {
            log_with_time('❌ [PostService] No transaction ID in response');
            console.error('[DEBUG] Transaction ID not found in response:', response);
            throw new Error('Failed to create inscription - no transaction ID returned');
        }
        log_with_time('✅ [PostService] Got transaction ID: ' + tx_id);

        // Create database post
        log_with_time('🔄 [PostService] Creating database post object');
            const dbPost = createDbPost(metadata, tx_id);
            dbPost.author_address = bsvAddress;
            
        // Add vote options if needed
            if (isVotePost && metadata.vote?.options) {
            log_with_time('🔄 [PostService] Adding vote options to database post');
                dbPost.is_vote = true;
            dbPost.vote_options = metadata.vote.options.map((option) => ({
                    id: `${tx_id}-option-${option.optionIndex}`,
                    tx_id: `${tx_id}-option-${option.optionIndex}`,
                    content: option.text,
                    author_address: bsvAddress,
                    created_at: new Date(metadata.timestamp),
                    post_id: tx_id,
                    option_index: option.optionIndex,
                    tags: metadata.tags || []
                }));
            }
            
        // Save to database
        try {
            log_with_time('🔄 [PostService] Preparing API request to save post');
                    // Create a copy of the dbPost object without vote_options for the API request
                    const { vote_options, ...postData } = dbPost;
                    
                    // Format vote options properly for the API
                    const formattedVoteOptions = vote_options?.map(option => ({
                        text: option.content,
                        tx_id: option.tx_id,
                        index: option.option_index
                    })) || [];
                    
                    // Prepare the final payload for the API
                    const apiPayload = {
                        ...postData,
                        vote_options: formattedVoteOptions
                    };
                    
            log_with_time('🔄 [PostService] Sending API request to save post');
                    const dbResponse = await fetch(`${API_BASE_URL}/api/posts`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(apiPayload)
                    });

                    if (!dbResponse.ok) {
                const errorData = await dbResponse.json();
                log_with_time('❌ [PostService] API error response:');
                console.error('API error response:', errorData);
                throw new Error(`API error: ${errorData.error || dbResponse.statusText}`);
            }

            log_with_time('✅ [PostService] Post saved to database successfully');
        } catch (dbError: any) {
            log_with_time('❌ [PostService] Database save error:');
            console.error('Database save error:', dbError);
            // Don't throw here, as the blockchain transaction was successful
            // We'll just log it and continue
        }

        // Success toast
        toast.success(
            scheduleInfo 
                ? 'Post scheduled successfully!' 
                : 'Post created successfully!', 
            { id: pendingToast }
        );
        
        log_with_time('✅ [PostService] Post creation complete');
        return dbPost as Post;
    } catch (error: any) {
        log_with_time(`❌ [PostService] Post creation error: ${error?.message || 'Unknown error'}`);
        console.error('Full error:', error);
        
        // Error toast with descriptive message
        let errorMessage = 'Failed to create post';
        
        if (error.message?.includes('timed out')) {
            errorMessage = 'Transaction is taking too long. Please try again.';
        } else if (error.message?.includes('not enough satoshis')) {
            errorMessage = 'Not enough BSV in your wallet. Please add funds and try again.';
        } else if (error.message?.includes('unauthorized') || error.message?.includes('Unauthorized')) {
            errorMessage = 'Wallet authorization failed. Please reconnect your wallet and try again.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        toast.error(errorMessage, { id: pendingToast });
        throw error;
    }
};

// Helper function to get image metadata
async function getImageMetadata(file: File): Promise<ImageData['metadata']> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({
                width: img.width,
                height: img.height,
                format: file.type.split('/')[1],
                size: file.size
            });
        };
        img.src = URL.createObjectURL(file);
    });
}

// Helper function to convert data URI or base64 string to blob
function dataURItoBlob(dataURI: string): Blob {
    // Check if it's a data URI (starts with data:)
    if (dataURI.startsWith('data:')) {
        // Split the data URI
        const parts = dataURI.split(',');
        const mime = parts[0].split(':')[1].split(';')[0];
        const isBase64 = parts[0].indexOf('base64') !== -1;
        const data = parts[1];
        
        // Decode base64 if needed
        const binary = isBase64 ? atob(data) : decodeURIComponent(data);
        const arrayBuffer = new ArrayBuffer(binary.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        
        for (let i = 0; i < binary.length; i++) {
            uint8Array[i] = binary.charCodeAt(i);
        }
        
        return new Blob([arrayBuffer], { type: mime });
    } else {
        // Assume it's a base64 string without data URI prefix
        try {
            // Try to decode as base64
            const binary = atob(dataURI.replace(/\s/g, ''));
            const arrayBuffer = new ArrayBuffer(binary.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            
            for (let i = 0; i < binary.length; i++) {
                uint8Array[i] = binary.charCodeAt(i);
            }
            
            // Default to png if we can't determine the type
            return new Blob([arrayBuffer], { type: 'image/png' });
        } catch (error) {
            console.error('Error converting string to blob:', error);
            throw new Error('Invalid base64 string');
        }
    }
}

// Helper types for post creation
interface InscribeRequest {
    address: string;
    base64Data: string;
    mimeType: MimeTypes;
    map: MAP;
    satoshis: number;
}

interface PostCreationData {
    content: string;
    author_address: string;
    post_id: string;
    media_url?: string | null;
    media_type?: string;
    description?: string;
    tags?: string[];
    is_locked: boolean;
    lock_duration?: number;
    lock_amount?: number;
    unlock_height?: number;
    scheduled?: {
        scheduledAt: string;
        timezone: string;
    };
}

interface Post extends PostCreationData {
    tx_id: string;
    created_at: string;
}

// Export other necessary functions and types
export type { Post, PostCreationData, InscribeRequest };