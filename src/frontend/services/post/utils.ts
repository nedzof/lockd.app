import { PostMetadata, DbPost, DbVoteOption } from './types';

/**
 * Convert string to base64
 */
export function stringToBase64(str: string): string {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode(Number('0x' + p1));
        }));
}

/**
 * Generate a unique post ID
 */
export function generatePostId(): string {
    return [
        Date.now().toString(36),
        Math.random().toString(36).substr(2, 9)
    ].join('-').substr(0, 32);
}

/**
 * Get current block height
 */
export async function getCurrentBlockHeight(): Promise<number> {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    return data.blocks;
}

/**
 * Hash content (for options hashing)
 */
export async function hashContent(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Convert data URI or base64 string to blob
 */
export function dataURItoBlob(dataURI: string): Blob {
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

/**
 * Convert PostMetadata to database Post object
 */
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

    // Add scheduled metadata
    if (metadata.scheduled) {
        post.metadata.scheduled = metadata.scheduled;
        post.scheduled_at = new Date(metadata.scheduled.scheduledAt);
    }

    // Add block and lock information
    if (metadata.block_height) post.block_height = metadata.block_height;
    if (metadata.amount) post.amount = metadata.amount;
    if (metadata.unlock_height) post.unlock_height = metadata.unlock_height;

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

/**
 * Convert PostMetadata to database vote_option objects
 */
export function createDbVoteOptions(metadata: PostMetadata, post_tx_id: string): DbVoteOption[] {
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