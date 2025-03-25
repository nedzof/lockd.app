import { toast } from 'react-hot-toast';
import { getBsvAddress } from '../../utils/walletConnectionHelpers';
import { dataURItoBlob, generatePostId, hashContent, createDbPost } from './utils';
import { processImage } from './image.service';
import { 
    createJsonInscriptionRequest, 
    calculateOutputSatoshis
} from './inscription.service';
import { 
    Post, 
    ImageData, 
    VoteOption, 
    PostMetadata, 
    ScheduleInfo,
    LockSettings 
} from './types';

// Define API base URL
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3003';

/**
 * Create a post with optional image and vote options
 */
export const createPost = async (
    wallet: any,
    content: string,
    imageData?: string | File,
    imageMimeType?: string,
    isVotePost: boolean = false,
    voteOptions: string[] = [],
    scheduleInfo?: ScheduleInfo,
    tags: string[] = [],
    lockSettings?: LockSettings
): Promise<Post> => {
    // Setup timing logs
    const startTime = Date.now();
    const logWithTime = (message: string) => {
        const elapsed = Date.now() - startTime;
        console.log(`⏱️ [${elapsed}ms] ${message}`);
    };

    // Validate inputs
    logWithTime('🔄 [PostService] Starting post creation process');
    if (!wallet) {
        throw new Error('Wallet is required');
    }

    // Get wallet address
    logWithTime('🔄 [PostService] Getting BSV address');
    const bsvAddress = await getBsvAddress(wallet);
    if (!bsvAddress) {
        throw new Error('Could not retrieve wallet address');
    }

    // Generate a post ID
    const postId = generatePostId();
    logWithTime('🔄 [PostService] Generated post_id: ' + postId);

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
            logWithTime('🔄 [PostService] Validating vote options: ' + voteOptions.length);
            const validOptions = voteOptions.filter(opt => opt.trim() !== '');
            if (validOptions.length < 2) {
                throw new Error('Vote posts require at least 2 valid options');
            }
        }

        // Create main content metadata
        logWithTime('🔄 [PostService] Creating post metadata');
        const metadata: PostMetadata = {
            app: 'lockd.app',
            type: isVotePost ? 'vote_question' : 'content',
            content,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            tags: tags || [],
            sequence: 1,
            post_id: postId,
            is_locked: !!lockSettings?.is_locked,
            lock_duration: lockSettings?.lock_duration,
            is_vote: isVotePost
        };

        // Add locking parameters if provided
        if (lockSettings?.is_locked && !isVotePost) {
            logWithTime('🔄 [PostService] Adding lock settings');
            metadata.amount = lockSettings.lock_amount;
        }

        // Add scheduling information if provided
        if (scheduleInfo) {
            logWithTime('🔄 [PostService] Adding schedule info');
            metadata.scheduled = scheduleInfo;
        }

        // Process image if provided
        if (imageData) {
            logWithTime('🔄 [PostService] Processing image data');
            try {
                let imageFile: File;
                
                // Handle different imageData types
                if (imageData instanceof File) {
                    imageFile = imageData;
                } else if (typeof imageData === 'string') {
                    const blob = dataURItoBlob(imageData);
                    imageFile = new File([blob], 'image.' + (blob.type.split('/')[1] || 'jpg'), { 
                        type: blob.type || imageMimeType || 'image/jpeg' 
                    });
                } else {
                    throw new Error('Invalid image data format');
                }
                
                // Process the image to get base64 and metadata
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
                
                // Add image to post metadata
                metadata.image = {
                    ...imageDataObj,
                    format: imageMetadata?.format || 'png'
                };
            } catch (imageError: any) {
                logWithTime('❌ [PostService] Error processing image: ' + imageError.message);
                toast.error(`Error processing image: ${imageError.message || 'Unknown error'}`, {
                    id: pendingToast
                });
                // Continue without the image
            }
        }

        // Handle vote post options
        if (isVotePost && voteOptions.length >= 2) {
            logWithTime('🔄 [PostService] Processing vote options');
            const validOptions = voteOptions.filter(opt => opt.trim() !== '');
            
            // Create vote options objects
            const voteOptionObjects: VoteOption[] = validOptions.map((text, index) => ({
                text,
                lock_amount: 1000, // Base lock amount in satoshis
                lock_duration: 144, // Default to 1 day (144 blocks)
                optionIndex: index
            }));
            
            // Add vote data to metadata
            metadata.vote = {
                is_vote_question: true,
                question: content,
                options: voteOptionObjects,
                total_options: voteOptionObjects.length,
                options_hash: await hashContent(JSON.stringify(voteOptionObjects))
            };
        }

        // Create a JSON-formatted inscription request
        logWithTime('🔄 [PostService] Creating JSON inscription request');
        const satoshis = await calculateOutputSatoshis(content.length, isVotePost);
        const request = createJsonInscriptionRequest(
            bsvAddress,
            content,
            metadata,
            satoshis
        );
        
        // Send to wallet
        logWithTime('🔄 [PostService] Sending inscription to wallet');
        const response = await wallet.inscribe([request]);
        
        // Extract transaction ID
        const txId = response?.tx_id || response?.id || response?.txid || 
                    (response?.hash ? response.hash.toString() : null) ||
                    (typeof response === 'string' ? response : null);
                        
        if (!txId) {
            throw new Error('Failed to create inscription - no transaction ID returned');
        }
        logWithTime('✅ [PostService] Got transaction ID: ' + txId);

        // Create database post
        const dbPost = createDbPost(metadata, txId);
        dbPost.author_address = bsvAddress;
            
        // Add vote options if needed
        if (isVotePost && metadata.vote?.options) {
            dbPost.is_vote = true;
            dbPost.vote_options = metadata.vote.options.map((option) => ({
                id: `${txId}-option-${option.optionIndex}`,
                tx_id: `${txId}-option-${option.optionIndex}`,
                content: option.text,
                author_address: bsvAddress,
                created_at: new Date(metadata.timestamp),
                post_id: txId,
                option_index: option.optionIndex,
                tags: metadata.tags || []
            }));
        }
            
        // Save to database
        try {
            logWithTime('🔄 [PostService] Preparing API request to save post');
            // Format for API
            const { vote_options, ...postData } = dbPost;
            const formattedVoteOptions = vote_options?.map(option => ({
                text: option.content,
                tx_id: option.tx_id,
                index: option.option_index
            })) || [];
            
            const apiPayload = {
                ...postData,
                vote_options: formattedVoteOptions
            };
                    
            // Send to API
            const dbResponse = await fetch(`${API_BASE_URL}/api/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiPayload)
            });

            if (!dbResponse.ok) {
                const errorData = await dbResponse.json();
                console.error('API error response:', errorData);
                throw new Error(`API error: ${errorData.error || dbResponse.statusText}`);
            }

            logWithTime('✅ [PostService] Post saved to database successfully');
        } catch (dbError: any) {
            logWithTime('❌ [PostService] Database save error:');
            console.error('Database save error:', dbError);
            // Don't throw here, as the blockchain transaction was successful
        }

        // Success toast
        toast.success(
            scheduleInfo ? 'Post scheduled successfully!' : 'Post created successfully!', 
            { id: pendingToast }
        );
        
        // Return the post data
        return {
            tx_id: txId,
            content: dbPost.content,
            author_address: dbPost.author_address,
            post_id: dbPost.post_id,
            created_at: dbPost.created_at.toISOString(),
            tags: dbPost.tags,
            is_locked: dbPost.is_locked,
            lock_duration: dbPost.lock_duration,
            media_type: dbPost.media_type,
            description: dbPost.description
        } as Post;
    } catch (error: any) {
        logWithTime(`❌ [PostService] Post creation error: ${error?.message || 'Unknown error'}`);
        
        // Format error message
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