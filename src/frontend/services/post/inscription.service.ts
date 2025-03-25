import { getFeeRate } from '../../../shared/utils/whatsOnChain';
import { 
    OrdinalInscription, 
    VoteOption as SharedVoteOption,
    VoteData as SharedVoteData,
    ImageMetadata as SharedImageMetadata
} from '../../../shared/types';
import { 
    PostMetadata, 
    InscribeRequest, 
    MAP, 
    ImageData,
    MimeTypes,
    VoteOption
} from './types';
import { stringToBase64 } from './utils';

/**
 * Create MAP data from metadata
 */
export function createMapData(metadata: PostMetadata): MAP {
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

    // Handle vote data
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
            
            // Include vote options directly in the map data
            mapData.vote_data = JSON.stringify(voteData);
            
            // Add these as direct fields for backward compatibility
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
            
            // Add each option directly for easier parsing by scanner
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

/**
 * Create a traditional inscription request
 */
export function createInscriptionRequest(
    address: string,
    content: string,
    map: MAP,
    satoshis: number,
    mimeType: string = 'text/plain'
): InscribeRequest {
    console.log(`[DEBUG] Creating inscription request:`);
    console.log(`[DEBUG] - Address: ${address}`);
    console.log(`[DEBUG] - Content preview: ${content.substring(0, 20)}${content.length > 20 ? '...' : ''}`);
    
    const request = {
        address,
        base64Data: mimeType.startsWith('image/') ? content : stringToBase64(content),
        mimeType: mimeType as MimeTypes,
        contentType: mimeType.startsWith('image/') ? 'image' as const : 'text' as const,
        type: mimeType.startsWith('image/') ? 'image' as const : 'text' as const,
        map,
        satoshis
    };
    
    return request;
}

/**
 * Create a JSON-formatted ordinal inscription request
 */
export function createJsonInscriptionRequest(
    address: string,
    content: string,
    metadata: PostMetadata,
    satoshis: number
): InscribeRequest {
    console.log(`[DEBUG] Creating JSON inscription request:`);
    console.log(`[DEBUG] - Address: ${address}`);
    console.log(`[DEBUG] - Content preview: ${content.substring(0, 20)}${content.length > 20 ? '...' : ''}`);
    
    // Create standardized ordinal inscription format
    const jsonInscription: OrdinalInscription = {
        content: content,
        metadata: {
            protocol: "lockd.app",
            post_id: metadata.post_id,
            author_address: address,
            created_at: metadata.timestamp || new Date().toISOString(),
            is_locked: metadata.is_locked,
            is_vote: metadata.is_vote,
            content_type: metadata.image ? metadata.image.content_type : "text/plain",
            tags: metadata.tags || []
        }
    };
    
    // Add optional fields
    if (metadata.block_height !== undefined) {
        jsonInscription.metadata.block_height = metadata.block_height;
    }
    
    if (metadata.is_locked && metadata.lock_duration !== undefined) {
        jsonInscription.metadata.lock_duration = metadata.lock_duration;
    }
    
    if (metadata.is_locked && metadata.amount !== undefined) {
        jsonInscription.metadata.lock_amount = metadata.amount;
    }
    
    // Add vote data if it's a vote post
    if (metadata.is_vote && metadata.vote) {
        const voteOptions: SharedVoteOption[] = metadata.vote.options?.map(opt => ({
            index: opt.optionIndex,
            content: opt.text
        })) || [];

        jsonInscription.vote_data = {
            question: metadata.vote.question || content,
            options: voteOptions,
            total_options: voteOptions.length || metadata.vote.total_options || 0
        };
    }
    
    // Add image metadata if present
    if (metadata.image && metadata.image.metadata) {
        jsonInscription.image_metadata = {
            media_type: metadata.image.content_type,
            content_type: metadata.image.content_type,
            filename: metadata.image.file?.name || `image.${metadata.image.format || 'jpg'}`,
            width: metadata.image.metadata.width,
            height: metadata.image.metadata.height,
            size: metadata.image.metadata.size
        };
    }
    
    // Log the complete inscription for debugging
    console.log(`[DEBUG] JSON Inscription:`, JSON.stringify(jsonInscription, null, 2));
    
    // For image posts, use the image data directly
    // For regular and vote posts, use the JSON formatted content
    let base64Data;
    let mimeType;
    
    if (metadata.image) {
        // For image posts, use the image data directly
        base64Data = metadata.image.base64Data;
        mimeType = metadata.image.content_type;
    } else {
        // For regular and vote posts, use the JSON formatted content
        const jsonContent = JSON.stringify(jsonInscription);
        base64Data = stringToBase64(jsonContent);
        mimeType = 'application/json';
    }
    
    const request = {
        address,
        base64Data,
        mimeType: mimeType as MimeTypes,
        contentType: metadata.image ? 'image' as const : 'text' as const,
        type: metadata.image ? 'image' as const : 'text' as const,
        map: createMapData(metadata), // Still include MAP data for backwards compatibility
        satoshis
    };
    
    return request;
}

/**
 * Create image component inscription
 */
export async function createImageComponent(
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
    
    // Log the image component details
    console.log(`Creating image component with tags:`, tags);

    return createInscriptionRequest(
        address,
        imageData.base64Data,
        map,
        satoshis,
        imageData.content_type
    );
}

/**
 * Calculate output satoshis for a transaction
 */
export async function calculateOutputSatoshis(
    contentSize: number, 
    is_vote_options_packed: boolean = false
): Promise<number> {
    // Get current fee rate from WhatsOnChain
    const feeRate = await getFeeRate();
    console.log(`Current fee rate: ${feeRate} sat/vbyte`);
    console.log(`Content size: ${contentSize} bytes`);
    
    // Base size for transaction overhead
    const baseTxSize = 250; // bytes
    
    // Account for additional data size for vote options
    let totalSize = baseTxSize + contentSize;
    if (is_vote_options_packed) {
        totalSize = baseTxSize + contentSize + 500; // Add extra bytes for vote options data
        console.log(`Adjusted size for packed vote options: ${totalSize} bytes`);
    }
    
    // Calculate fee based on size and rate
    const calculatedFee = Math.ceil(totalSize * feeRate);
    console.log(`Calculated base fee: ${calculatedFee} satoshis`);
    
    // For vote with packed options, use a more substantial output
    if (is_vote_options_packed) {
        // Use a more aggressive calculation for votes
        const baseValue = Math.max(contentSize * 150);
        console.log(`Base value (contentSize * 150): ${baseValue}`);
        
        // Scale based on fee rate too
        const feeMultiplier = Math.max(Math.ceil(feeRate / 0.5)); 
        const feeBasedValue = calculatedFee * feeMultiplier;
        console.log(`Fee-based value (calculatedFee * ${feeMultiplier}): ${feeBasedValue}`);
        
        // Ensure we have a good minimum value for the vote with options
        const recommendedVoteSats = Math.max(baseValue, feeBasedValue, 1);
        
        console.log(`Final vote with packed options satoshis: ${recommendedVoteSats}`);
        return recommendedVoteSats;
    }
    
    // For regular content, ensure minimum dust limit
    return Math.max(calculatedFee);
} 