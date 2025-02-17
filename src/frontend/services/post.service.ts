import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';
import { MimeTypes, MAP } from 'yours-wallet-provider';
import { getFeeRate } from '../../shared/utils/whatsOnChain';
import { FiExternalLink } from 'react-icons/fi';

// Add API base URL configuration at the top of the file
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001';

// Base interfaces
export interface VoteOption {
    text: string;
    lockAmount: number;
    lockDuration: number;
    optionIndex: number;
}

export interface VoteData {
    isVoteQuestion: boolean;
    question?: string;
    options?: VoteOption[];
    totalOptions?: number;
    optionsHash?: string;
    selectedOption?: VoteOption;
}

export interface ImageData {
    file: File;
    contentType: string;
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
    txid: string;
    postId: string;
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
    vote_options?: DbVoteOption[];
}

export interface DbVoteOption {
    id: string;
    txid: string;
    postId: string;
    post_txid: string;
    content: string;
    description: string;
    author_address: string;
    created_at: Date;
    lock_amount: number;
    lock_duration: number;
    unlock_height: number;
    current_height: number;
    lock_percentage: number;
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
    postId: string;
    block_height?: number;
    amount?: number;
    unlock_height?: number;
    is_locked: boolean;
    lock_duration?: number;
    is_vote: boolean;
    vote?: {
        isVoteQuestion: boolean;
        question?: string;
        options?: Array<{
            text: string;
            lockAmount: number;
            lockDuration: number;
            optionIndex: number;
            unlockHeight?: number;
            currentHeight?: number;
            lockPercentage?: number;
        }>;
        totalOptions?: number;
        optionsHash?: string;
    };
    image?: {
        file: File;
        contentType: string;
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
export function createDbPost(metadata: PostMetadata, txid: string): DbPost {
    const post: DbPost = {
        id: metadata.postId,
        txid,
        postId: metadata.postId,
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
        post.media_type = metadata.image.contentType;
        post.image_format = metadata.image.format;
        post.image_source = metadata.image.source;
        post.description = metadata.image.description;
        if (metadata.image.base64Data) {
            post.raw_image_data = metadata.image.base64Data;
        }
    }

    return post;
}

// Helper function to convert PostMetadata to database VoteOption objects
export function createDbVoteOptions(metadata: PostMetadata, post_txid: string): DbVoteOption[] {
    if (!metadata.vote?.options) {
        return [];
    }

    return metadata.vote.options.map((option, index) => ({
        id: `${metadata.postId}-option-${index}`,
        txid: '', // This will be set when the transaction is created
        postId: metadata.postId,
        post_txid,
        content: option.text,
        description: '',
        author_address: '', // This will be set by the caller
        created_at: new Date(metadata.timestamp),
        lock_amount: option.lockAmount,
        lock_duration: option.lockDuration,
        unlock_height: option.unlockHeight || 0,
        current_height: option.currentHeight || 0,
        lock_percentage: option.lockPercentage || 0,
        option_index: option.optionIndex,
        tags: metadata.tags
    }));
}

// Create MAP data from metadata
function createMapData(metadata: PostMetadata): MAP {
    // Check if this is a vote based on metadata
    const isVote = metadata.is_vote || 
                  metadata.vote?.isVoteQuestion || 
                  (metadata.vote?.options && metadata.vote.options.length > 0);

    const mapData: Record<string, string> = {
        app: metadata.app,
        type: metadata.type,
        content: metadata.content,
        timestamp: metadata.timestamp,
        version: metadata.version,
        tags: JSON.stringify(metadata.tags),
        sequence: metadata.sequence.toString(),
        is_locked: metadata.is_locked.toString(),
        is_vote: isVote.toString()
    };

    if (metadata.parentSequence !== undefined) {
        mapData.parentSequence = metadata.parentSequence.toString();
    }

    if (metadata.postId) {
        mapData.postId = metadata.postId;
    }

    if (metadata.block_height) {
        mapData.block_height = metadata.block_height.toString();
    }

    if (metadata.amount) {
        mapData.amount = metadata.amount.toString();
    }

    if (metadata.unlock_height) {
        mapData.unlock_height = metadata.unlock_height.toString();
    }

    if (metadata.lock_duration) {
        mapData.lock_duration = metadata.lock_duration.toString();
    }

    if (metadata.vote) {
        // Always set type to vote_question if we have vote options
        if (metadata.vote.isVoteQuestion || (metadata.vote.options && metadata.vote.options.length > 0)) {
            mapData.type = 'vote_question';
            mapData.totalOptions = (metadata.vote.options?.length || metadata.vote.totalOptions || 0).toString();
            if (metadata.vote.optionsHash) {
                mapData.optionsHash = metadata.vote.optionsHash;
            }
        } else if (metadata.vote.options?.[0]) {
            const option = metadata.vote.options[0];
            mapData.type = 'vote_option';
            mapData.optionIndex = option.optionIndex.toString();
            mapData.lockAmount = option.lockAmount.toString();
            mapData.lockDuration = option.lockDuration.toString();
            if (option.unlockHeight) {
                mapData.unlockHeight = option.unlockHeight.toString();
            }
            if (option.currentHeight) {
                mapData.currentHeight = option.currentHeight.toString();
            }
            if (option.lockPercentage) {
                mapData.lockPercentage = option.lockPercentage.toString();
            }
        }
    }

    if (metadata.image) {
        mapData.contentType = metadata.image.contentType;
        mapData.format = metadata.image.format;
        if (metadata.image.source) {
            mapData.imageSource = metadata.image.source;
        }
        if (metadata.image.metadata) {
            mapData.imageWidth = metadata.image.metadata.width.toString();
            mapData.imageHeight = metadata.image.metadata.height.toString();
            mapData.imageSize = metadata.image.metadata.size.toString();
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
    postId: string,
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
        postId,
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
        imageData.contentType
    );
}

// Create vote question component
async function createVoteQuestionComponent(
    question: string,
    options: VoteOption[],
    postId: string,
    sequence: number,
    parentSequence: number,
    address: string
): Promise<InscribeRequest> {
    const optionsHash = await hashContent(JSON.stringify(options));
    
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'vote_question',
        content: question,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
        sequence,
        parentSequence,
        postId,
        is_locked: false,
        is_vote: true,
        vote: {
            isVoteQuestion: true,
            question,
            options,
            totalOptions: options.length,
            optionsHash
        }
    };

    const map = createMapData(metadata);
    const satoshis = await calculateOutputSatoshis(question.length);

    return createInscriptionRequest(address, question, map, satoshis);
}

// Create vote option component
function createVoteOptionComponent(
    option: VoteOption,
    postId: string,
    sequence: number,
    parentSequence: number,
    address: string
): InscribeRequest {
    const metadata: PostMetadata = {
        app: 'lockd.app',
        type: 'vote_option',
        content: option.text,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
        sequence,
        parentSequence,
        postId,
        is_locked: true,
        lock_duration: option.lockDuration,
        is_vote: true,
        vote: {
            isVoteQuestion: false,
            options: [option]
        }
    };

    const map = createMapData(metadata);
    return createInscriptionRequest(address, option.text, map, 1000);
}

// Helper function to calculate output satoshis
async function calculateOutputSatoshis(contentSize: number): Promise<number> {
    const feeRate = await getFeeRate();
    return Math.max(1000, Math.ceil(contentSize * feeRate));
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
function generatePostId(): string {
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
async function getCurrentBlockHeight(): Promise<number> {
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
        const supportedWebFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
        
        // Keep original format if it's web-supported, otherwise use PNG
        const outputFormat = supportedWebFormats.includes(format) ? format : 'png';
        
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
    content: string,
    authorAddress: string,
    wallet: NonNullable<ReturnType<typeof useYoursWallet>>,
    imageFile?: File,
    description?: string,
    tags?: string[],
    lockData?: {
        isLocked: boolean;
        duration?: number;
        amount?: number;
        isPoll?: boolean;
        options?: Array<{ text: string; lockDuration: number; lockAmount: number }>;
    }
): Promise<Post> => {
    try {
        const postId = generatePostId();
        const sequence = createSequence();
        const components: InscribeRequest[] = [];

        // Show pending toast
        const pendingToast = toast.loading('Creating post...', {
            style: {
                background: '#1A1B23',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }
        });

        try {
            // Create main content metadata
            const metadata: PostMetadata = {
                app: 'lockd.app',
                type: 'content',
                content,
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                tags: tags || [],
                sequence: sequence.next(),
                postId,
                is_locked: lockData?.isLocked || false,
                is_vote: !!(lockData?.isPoll || lockData?.options?.length), // Set is_vote true if isPoll or has options
                lock_duration: lockData?.duration
            };

            if (lockData?.isLocked) {
                const currentHeight = await getCurrentBlockHeight();
                metadata.block_height = currentHeight;
                metadata.amount = lockData.amount;
                metadata.unlock_height = currentHeight + (lockData.duration || 0);
            }

            // Add image if present
            if (imageFile) {
                const { base64Data, metadata: imageMetadata } = await processImage(imageFile);
                const imageData: ImageData = {
                    file: imageFile,
                    contentType: `image/${imageMetadata.format}`,
                    base64Data,
                    description,
                    metadata: imageMetadata
                };
                metadata.image = {
                    ...imageData,
                    format: imageMetadata.format
                };

                // Create image component
                const imageComponent = createInscriptionRequest(
                    authorAddress,
                    base64Data,
                    createMapData({ ...metadata, type: 'image' }),
                    await calculateOutputSatoshis(base64Data.length),
                    imageData.contentType
                );
                components.push(imageComponent);
            }

            // Add vote data if present
            if (lockData?.isPoll || lockData?.options?.length) {
                metadata.vote = {
                    isVoteQuestion: true,
                    question: content,
                    options: lockData.options?.map((opt, idx) => ({
                        text: opt.text,
                        lockAmount: opt.lockAmount,
                        lockDuration: opt.lockDuration,
                        optionIndex: idx
                    })) || [],
                    totalOptions: lockData.options?.length || 0,
                    optionsHash: await hashContent(JSON.stringify(lockData.options || []))
                };

                // Create vote option components
                if (metadata.vote.options?.length) {
                    for (const option of metadata.vote.options) {
                        const optionComponent = createVoteOptionComponent(
                            option,
                            postId,
                            sequence.next(),
                            0,
                            authorAddress
                        );
                        components.push(optionComponent);
                    }
                }
            }

            // Create main content component
            const contentComponent = createInscriptionRequest(
                authorAddress,
                content,
                createMapData(metadata),
                await calculateOutputSatoshis(content.length)
            );
            components.push(contentComponent);

            // Send to wallet
            const response = await wallet.inscribe(components);
            const txid = response.txid || response.id;

            if (!txid) {
                throw new Error('Failed to create inscription - no transaction ID returned');
            }

            // Create post in database
            const dbPost = createDbPost(metadata, txid);
            dbPost.author_address = authorAddress;

            const dbResponse = await fetch(`${API_BASE_URL}/api/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dbPost)
            });

            if (!dbResponse.ok) {
                throw new Error(`Failed to create post in database: ${dbResponse.statusText}`);
            }

            const createdPost = await dbResponse.json();

            // Update toast
            toast.success('Post created successfully!', {
                id: pendingToast,
                style: {
                    background: '#1A1B23',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }
            });

            return createdPost;

        } catch (error) {
            console.error('Error in post creation:', error);
            toast.error('Failed to create post', {
                id: pendingToast,
                style: {
                    background: '#1A1B23',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }
            });
            throw error;
        }
    } catch (error) {
        console.error('Top-level error in createPost:', error);
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
    postId: string;
    media_url?: string | null;
    media_type?: string;
    description?: string;
    tags?: string[];
    isLocked: boolean;
    lockDuration?: number;
    lockAmount?: number;
    unlockHeight?: number;
}

interface Post extends PostCreationData {
    txid: string;
    created_at: string;
}

// Export other necessary functions and types
export type { Post, PostCreationData, InscribeRequest };