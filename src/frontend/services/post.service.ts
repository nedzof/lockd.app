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
        id: metadata.post_id,
        tx_id,
        post_id: metadata.post_id,
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

    if (metadata.block_height) {
        post.block_height = metadata.block_height;
    }

    if (metadata.amount) {
        post.amount = metadata.amount;
    }

    if (metadata.unlock_height) {
        post.unlock_height = metadata.unlock_height;
    }

    if (metadata.image) {
        post.media_type = metadata.image.content_type;
        post.image_format = metadata.image.format;
        post.image_source = metadata.image.source;
        post.description = metadata.image.description;
        if (metadata.image.base64Data) {
            post.raw_image_data = metadata.image.base64Data;
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
        id: `${metadata.post_id}-option-${index}`,
        tx_id: '', // This will be set when the transaction is created
        content: option.text,
        author_address: '', // This will be set by the caller
        created_at: new Date(metadata.timestamp),
        post_id: metadata.post_id,
        option_index: option.optionIndex,
        tags: metadata.tags
    }));
}

// Create MAP data from metadata
function createMapData(metadata: PostMetadata): MAP {
    // Check if this is a vote based on metadata
    const isVote = metadata.is_vote || 
                  metadata.vote?.is_vote_question || 
                  (metadata.vote?.options && metadata.vote.options.length > 0);

    const mapData: Record<string, string> = {
        app: metadata.app || 'lockd.app',
        type: metadata.type || 'content',
        content: metadata.content || '',
        timestamp: metadata.timestamp || new Date().toISOString(),
        version: metadata.version || '1.0.0',
        tags: JSON.stringify(metadata.tags || []),
        sequence: (metadata.sequence || 0).toString(),
        is_vote: (isVote !== undefined ? isVote : false).toString()
    };

    // Only include is_locked for non-vote options
    if (metadata.type !== 'vote_option' && metadata.is_locked !== undefined) {
        mapData.is_locked = metadata.is_locked.toString();
    }

    if (metadata.parentSequence !== undefined) {
        mapData.parentSequence = metadata.parentSequence.toString();
    }

    if (metadata.post_id) {
        mapData.post_id = metadata.post_id;
    }

    if (metadata.block_height !== undefined) {
        mapData.block_height = metadata.block_height.toString();
    }

    if (metadata.amount !== undefined) {
        mapData.amount = metadata.amount.toString();
    }

    if (metadata.unlock_height !== undefined) {
        mapData.unlock_height = metadata.unlock_height.toString();
    }

    // Only include lock_duration for non-vote options
    if (metadata.type !== 'vote_option' && metadata.lock_duration !== undefined) {
        mapData.lock_duration = metadata.lock_duration.toString();
    }

    if (metadata.vote) {
        // Always set type to vote_question if we have vote options
        if (metadata.vote.is_vote_question || (metadata.vote.options && metadata.vote.options.length > 0)) {
            mapData.type = 'vote_question';
            mapData.total_options = ((metadata.vote.options?.length || metadata.vote.total_options || 0)).toString();
            if (metadata.vote.options_hash) {
                mapData.options_hash = metadata.vote.options_hash;
            }
        } else if (metadata.vote.optionIndex !== undefined) {
            // For vote options, only include essential fields
            mapData.type = 'vote_option';
            mapData.optionIndex = metadata.vote.optionIndex.toString();
        }
    }

    if (metadata.image) {
        mapData.content_type = metadata.image.content_type || '';
        mapData.format = metadata.image.format || '';
        if (metadata.image.source) {
            mapData.imageSource = metadata.image.source;
        }
        if (metadata.image.metadata) {
            if (metadata.image.metadata.width !== undefined) {
                mapData.imageWidth = metadata.image.metadata.width.toString();
            }
            if (metadata.image.metadata.height !== undefined) {
                mapData.imageHeight = metadata.image.metadata.height.toString();
            }
            if (metadata.image.metadata.size !== undefined) {
                mapData.imageSize = metadata.image.metadata.size.toString();
            }
        }
        if (metadata.image.description) {
            mapData.description = metadata.image.description;
        }
    }

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
    return {
        address,
        base64Data: mimeType.startsWith('image/') ? content : stringToBase64(content),
        mimeType: mimeType as MimeTypes,
        map,
        satoshis
    };
}

// Create image component
async function createImageComponent(
    imageData: ImageData,
    post_id: string,
    sequence: number,
    parentSequence: number,
    address: string
): Promise<InscribeRequest> {
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'image',
        content: imageData.description || '',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
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

    return createInscriptionRequest(
        address,
        imageData.base64Data,
        map,
        satoshis,
        imageData.content_type
    );
}

// Create vote question component
async function createVoteQuestionComponent(
    question: string,
    options: vote_option[],
    post_id: string,
    sequence: number,
    parentSequence: number,
    address: string
): Promise<InscribeRequest> {
    const options_hash = await hashContent(JSON.stringify(options));
    
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'vote_question',
        content: question,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
        sequence,
        parentSequence,
        post_id,
        is_locked: false,
        is_vote: true,
        vote: {
            is_vote_question: true,
            question,
            options,
            total_options: options.length,
            options_hash
        }
    };

    const map = createMapData(metadata);
    const satoshis = await calculateOutputSatoshis(question.length);

    return createInscriptionRequest(address, question, map, satoshis);
}

// Create vote option component
async function createvote_optionComponent(
    option: vote_option,
    post_id: string,
    sequence: number,
    parentSequence: number,
    address: string
): Promise<InscribeRequest> {
    // Create minimal metadata for vote options
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'vote_option',
        content: option.text,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
        sequence,
        parentSequence,
        post_id,
        is_vote: true,
        vote: {
            is_vote_question: false,
            optionIndex: option.optionIndex
        }
    };

    const map = createMapData(metadata);
    const satoshis = option.feeSatoshis || await calculateOutputSatoshis(option.text.length, true);
    
    // Log the vote option details for debugging
    console.log(`Creating vote option #${option.optionIndex}: "${option.text}" with ${satoshis} satoshis`);
    
    return createInscriptionRequest(address, option.text, map, satoshis);
}

// Helper function to calculate output satoshis
async function calculateOutputSatoshis(contentSize: number, is_vote_option: boolean = false): Promise<number> {
    // Get current fee rate from WhatsOnChain
    const feeRate = await getFeeRate();
    console.log(`Current fee rate: ${feeRate} sat/vbyte`);
    console.log(`Content size: ${contentSize} bytes`);
    
    // Base size for transaction overhead (P2PKH output, basic script)
    const baseTxSize = 250; // bytes
    
    // Calculate total size including content and overhead
    const totalSize = baseTxSize + contentSize;
    console.log(`Total transaction size: ${totalSize} bytes`);
    
    // Calculate fee based on size and rate
    const calculatedFee = Math.ceil(totalSize * feeRate);
    console.log(`Calculated base fee: ${calculatedFee} satoshis`);
    
    // For vote options, ensure we have enough satoshis for the lock amount
    // This ensures each vote option has its own UTXO with sufficient value
    if (is_vote_option) {
        // For vote options, use a more aggressive calculation
        // Especially for short content
        
        // Base value that scales with content length
        const baseValue = Math.max(contentSize * 100);
        console.log(`Base value (contentSize * 100): ${baseValue}`);
        
        // Scale based on fee rate too
        const feeMultiplier = Math.max(Math.ceil(feeRate / 0.5)); 
        const feeBasedValue = calculatedFee * feeMultiplier;
        console.log(`Fee-based value (calculatedFee * ${feeMultiplier}): ${feeBasedValue}`);
        
        // Ensure we have a good minimum value that varies by content
        const recommendedvote_optionSats = Math.max(baseValue, feeBasedValue);
        
        console.log(`Final vote option satoshis: ${recommendedvote_optionSats}`);
        
        // Force the value to be different for each option by adding the content length
        // This ensures even identical options have slightly different values
        return recommendedvote_optionSats + contentSize;
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

// Helper function to create a sequence counter
interface ComponentSequence {
    current: number;
    next(): number;
}

function createSequence(): ComponentSequence {
    let current = 0;
    return {
        get current() { return current; },
        next() { return current++; }
    };
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
    vote_options: string[] = []
): Promise<Post> => {
    console.log('Creating post with wallet:', wallet ? 'Wallet provided' : 'No wallet');
    console.log('Is vote post:', isVotePost, 'Vote options:', vote_options);
  
    if (!wallet) {
        console.error('No wallet provided to createPost');
        throw new Error('Wallet is required to create a post');
    }

    // Get BSV address using our helper function
    let bsvAddress;
    try {
        bsvAddress = await getBsvAddress(wallet);
        if (!bsvAddress) {
            console.error('Failed to get BSV address for post creation');
            throw new Error('Could not retrieve wallet address. Please ensure your wallet is connected.');
        }
        console.log('Using BSV address for post creation:', bsvAddress);
    } catch (walletError) {
        console.error('Error getting BSV address:', walletError);
        throw new Error(`Wallet connection error: ${walletError.message || 'Could not connect to wallet'}`);
    }

    const post_id = generatepost_id();
    const sequence = createSequence();
    const components: InscribeRequest[] = [];

    // Show pending toast
    const pendingToast = toast.loading('Creating post...', {
        style: {
            background: '#1A1B23',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.375rem'
        }
    });

    try {
        // Create main content metadata
        const metadata: PostMetadata = {
            app: 'lockd.app',
            type: isVotePost ? 'vote_question' : 'content',
            content,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            tags: [],
            sequence: sequence.next(),
            post_id,
            is_locked: false,
            is_vote: isVotePost
        };

        console.log('Created post metadata:', { ...metadata, content: content.substring(0, 50) + (content.length > 50 ? '...' : '') });

        // Add image if present
        if (imageData) {
            try {
                console.log('Processing image data of type:', typeof imageData);
                if (imageData instanceof File) {
                    console.log('Image is a File object:', { 
                        name: imageData.name, 
                        type: imageData.type, 
                        size: imageData.size 
                    });
                } else if (typeof imageData === 'string') {
                    console.log('Image is a string, length:', imageData.length);
                    console.log('Image string preview:', imageData.substring(0, 50) + '...');
                }

                let processedImage;
                let imageFile: File;
                
                // Handle different imageData types
                if (imageData instanceof File) {
                    // If imageData is already a File
                    imageFile = imageData;
                    
                    // Validate supported image formats
                    const supportedFormats = [
                        'image/jpeg', 
                        'image/jpg', 
                        'image/png', 
                        'image/gif', 
                        'image/bmp', 
                        'image/svg+xml', 
                        'image/webp', 
                        'image/tiff'
                    ];
                    
                    if (!supportedFormats.includes(imageFile.type)) {
                        throw new Error(`Unsupported image format: ${imageFile.type}. Please use JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF.`);
                    }
                    
                    processedImage = await processImage(imageFile);
                } else if (typeof imageData === 'string') {
                    // If imageData is a string (base64 or data URL)
                    if (!imageMimeType) {
                        // Try to detect MIME type from data URI
                        if (imageData.startsWith('data:')) {
                            const mimeMatch = imageData.match(/^data:([^;]+);/);
                            if (mimeMatch && mimeMatch[1]) {
                                imageMimeType = mimeMatch[1];
                                console.log('Detected MIME type from data URI:', imageMimeType);
                            } else {
                                console.warn('Could not detect MIME type from data URI, defaulting to image/png');
                                imageMimeType = 'image/png';
                            }
                        } else {
                            console.warn('No MIME type provided for image data string, defaulting to image/png');
                            imageMimeType = 'image/png';
                        }
                    }
                    
                    try {
                        const blob = dataURItoBlob(imageData);
                        console.log('Successfully converted string to blob:', { 
                            type: blob.type, 
                            size: blob.size 
                        });
                        
                        imageFile = new File([blob], 'image', { type: imageMimeType });
                        processedImage = await processImage(imageFile);
                    } catch (error) {
                        console.error('Error processing image string:', error);
                        throw new Error(`Failed to process image: ${error.message}`);
                    }
                } else {
                    console.error('Invalid image data format:', imageData);
                    throw new Error('Invalid image data format');
                }
                
                console.log('Image processed successfully:', { 
                    hasBase64Data: !!processedImage.base64Data,
                    base64Length: processedImage.base64Data?.length,
                    metadata: processedImage.metadata
                });
                
                const { base64Data, metadata: imageMetadata } = processedImage;
                
                const imageDataObj: ImageData = {
                    file: imageFile,
                    content_type: `image/${imageMetadata.format}`,
                    base64Data,
                    metadata: imageMetadata
                };
                
                metadata.image = {
                    ...imageDataObj,
                    format: imageMetadata.format
                };

                console.log('Added image to metadata:', { 
                    content_type: imageDataObj.content_type,
                    format: imageMetadata.format,
                    dimensions: `${imageMetadata.width}x${imageMetadata.height}`
                });

                // Create image component
                console.log('Creating image inscription request...');
                const imageComponent = createInscriptionRequest(
                    bsvAddress,
                    base64Data,
                    createMapData({ ...metadata, type: 'image' }),
                    await calculateOutputSatoshis(base64Data.length),
                    imageDataObj.content_type
                );
                components.push(imageComponent);
                console.log('Image component created successfully');
            } catch (imageError) {
                console.error('Error processing image:', imageError);
                toast.error(`Error processing image: ${imageError.message}`, {
                    id: pendingToast,
                    style: {
                        background: '#1A1B23',
                        color: '#f87171',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                        borderRadius: '0.375rem'
                    }
                });
                // Continue without the image
                console.log('Continuing post creation without image');
            }
        }

        // Handle vote post
        if (isVotePost && vote_options.length >= 2) {
            console.log('Creating vote post with options:', vote_options);
            
            // Filter out empty options
            const validOptions = vote_options.filter(opt => opt.trim() !== '');
            
            if (validOptions.length < 2) {
                throw new Error('Vote posts require at least 2 valid options');
            }
            
            // Get current block height for lock calculations
            const currentblock_height = await getCurrentblock_height();
            console.log('Current block height:', currentblock_height);
            
            // Create vote options objects
            const vote_optionObjects: vote_option[] = await Promise.all(
                validOptions.map(async (text, index) => ({
                    text,
                    lock_amount: 1000, // Base lock amount in satoshis
                    lock_duration: 144, // Default to 1 day (144 blocks)
                    optionIndex: index,
                    feeSatoshis: await calculateOutputSatoshis(text.length, true)
                }))
            );
            
            // Add vote data to metadata
            metadata.vote = {
                is_vote_question: true,
                question: content,
                options: vote_optionObjects,
                total_options: vote_optionObjects.length,
                options_hash: await hashContent(JSON.stringify(vote_optionObjects))
            };
            
            // Create main vote question component
            console.log('Creating vote question component...');
            const voteQuestionComponent = await createVoteQuestionComponent(
                content,
                vote_optionObjects,
                post_id,
                sequence.next(),
                metadata.sequence,
                bsvAddress
            );
            components.push(voteQuestionComponent);
            
            // Create individual components for each vote option
            // Each with its own transaction output for easy parsing
            for (const option of vote_optionObjects) {
                console.log(`Creating vote option component for "${option.text}"...`);
                const vote_optionComponent = await createvote_optionComponent(
                    option,
                    post_id,
                    sequence.next(),
                    metadata.sequence,
                    bsvAddress
                );
                components.push(vote_optionComponent);
            }
            
            console.log(`Created ${components.length} components for vote post`);
        } else {
            // Create regular content component
            console.log('Creating main content inscription request...');
            const contentComponent = createInscriptionRequest(
                bsvAddress,
                content,
                createMapData(metadata),
                await calculateOutputSatoshis(content.length)
            );
            components.push(contentComponent);
            console.log('Content component created successfully');
        }

        // Send to wallet
        console.log('Sending inscription request to wallet...');
        const response = await wallet.inscribe(components);
        console.log('Wallet inscription response:', response);
        
        const tx_id = response.tx_id || response.id;
        if (!tx_id) {
            throw new Error('Failed to create inscription - no transaction ID returned');
        }
        console.log('Inscription successful with tx_id:', tx_id);

        // Create post in database
        const dbPost = createDbPost(metadata, tx_id);
        dbPost.author_address = bsvAddress;
        
        // Add vote options if this is a vote post
        if (isVotePost && metadata.vote?.options) {
            dbPost.is_vote = true;
            dbPost.vote_options = metadata.vote.options.map(option => ({
                content: option.text,
                option_index: option.optionIndex
            }));
        }
        
        console.log('Created database post object:', { 
            ...dbPost, 
            content: dbPost.content.substring(0, 50) + '...',
            vote_options: dbPost.vote_options
        });

        // Function to attempt the database post creation with retry logic
        const attemptDatabasePost = async (retries = 2): Promise<any> => {
            try {
                console.log(`Attempting to create post in database (retries left: ${retries})`, dbPost);
                
                const dbResponse = await fetch(`${API_BASE_URL}/api/posts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(dbPost)
                });

                if (!dbResponse.ok) {
                    const errorText = await dbResponse.text();
                    let errorDetails;
                    try {
                        errorDetails = JSON.parse(errorText);
                    } catch (e) {
                        errorDetails = errorText;
                    }
                    
                    console.error('Database error response:', {
                        status: dbResponse.status,
                        statusText: dbResponse.statusText,
                        body: errorDetails
                    });
                    
                    // If we have retries left, wait and try again
                    if (retries > 0) {
                        console.log(`Retrying database post creation in 1 second...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return attemptDatabasePost(retries - 1);
                    }
                    
                    throw new Error(`Failed to create post in database: ${dbResponse.statusText}`);
                }
                
                return dbResponse.json();
            } catch (error) {
                if (retries > 0) {
                    console.log(`Network error, retrying database post creation in 1 second...`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return attemptDatabasePost(retries - 1);
                }
                throw error;
            }
        };
        
        // Attempt to create the post with retry logic
        const createdPost = await attemptDatabasePost();

        // Update toast
        toast.success('Post created successfully!', {
            id: pendingToast,
            style: {
                background: '#1A1B23',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                borderRadius: '0.375rem'
            }
        });

        return createdPost;

    } catch (error) {
        console.error('Error in post creation:', error);
        toast.error(`Failed to create post: ${error.message}`, {
            id: pendingToast,
            style: {
                background: '#1A1B23',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '0.375rem'
            }
        });
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
}

interface Post extends PostCreationData {
    tx_id: string;
    created_at: string;
}

// Export other necessary functions and types
export type { Post, PostCreationData, InscribeRequest };