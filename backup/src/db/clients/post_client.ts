import { Post, VoteOption, PostMetadata, ParsedTransaction } from '../../shared/types.js';
import { logger } from '../../utils/logger.js';
import { BaseDbClient } from './base_client.js';

/**
 * Client for interacting with post-related database operations
 */
export class PostClient extends BaseDbClient {
    /**
     * Create a new post or update an existing one
     * @param tx Transaction containing post data
     * @returns Created or updated post
     */
    public async create_or_update_post(tx: ParsedTransaction): Promise<Post | null> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            const metadata = tx.metadata as PostMetadata;
            
            if (!metadata || !metadata.post_txid) {
                logger.warn('⚠️ Missing post_txid', { tx_id: tx.tx_id });
                return null;
            }
            
            logger.debug('📝 Creating/updating post', { 
                tx_id: tx.tx_id, 
                post_txid: metadata.post_txid
            });
            
            // Prioritize transaction content over metadata content
            const content = tx.content || metadata.content || '';
            
            // Log content details
            logger.info('🔍 Post content check', { 
                tx_id: tx.tx_id, 
                content_exists: !!content,
                content_length: content.length,
                content_preview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                from_tx: !!tx.content,
                from_metadata: !!metadata.content
            });
            
            // Check for binary content and media types
            const has_binary_content = (
                (tx.content_type && tx.content_type.startsWith('image/')) ||
                (tx.media_type && tx.media_type.startsWith('image/')) ||
                (metadata.content_type && metadata.content_type.startsWith('image/'))
            );
            
            // Handle GIF and other binary image types
            if (has_binary_content) {
                logger.info('🖼️ Detected binary image content in post', { 
                    tx_id: tx.tx_id,
                    post_txid: metadata.post_txid,
                    content_type: tx.content_type || metadata.content_type || 'unknown',
                    media_type: tx.media_type || metadata.media_type || 'unknown'
                });
            }
            
            // Prepare post data
            const post_data = {
                tx_id: metadata.post_txid,
                content: content, // Use the prioritized content from above
                block_height: typeof tx.block_height !== 'undefined' && tx.block_height !== null && !isNaN(Number(tx.block_height))
                    ? Number(tx.block_height)
                    : null,
                author_address: metadata.author_address || tx.author_address || null,
                is_vote: metadata.is_vote === true,
                is_locked: metadata.is_locked === true,
                // Set media_type if present in transaction or metadata
                media_type: tx.media_type || metadata.media_type || null,
                // Store content_type from transaction or metadata
                content_type: tx.content_type || metadata.content_type || null,
                // Store raw image data if present
                raw_image_data: tx.raw_image_data || metadata.raw_image_data || null,
                metadata: {
                    ...metadata,
                    content: content, // Also store content in metadata for consistency
                    block_time: this.create_block_time_bigint(tx.block_time),
                    is_deleted: metadata.is_deleted === true,
                    parent_post_txid: metadata.parent_post_txid || null,
                    orig_post_txid: metadata.orig_post_txid || null,
                    // Include image metadata if available
                    image_metadata: tx.image_metadata || metadata.image_metadata || null,
                    // Include additional fields for binary content
                    media_type: tx.media_type || metadata.media_type || null,
                    content_type: tx.content_type || metadata.content_type || null
                }
            };
            
            // Create or update the post
            const post = await this.with_fresh_client(async (client) => {
                return await client.post.upsert({
                    where: { tx_id: metadata.post_txid },
                    update: post_data,
                    create: post_data
                });
            });
            
            logger.debug('✅ Post saved', { 
                tx_id: post.tx_id,
                author: post.author_address
            });
            
            return post;
        } catch (error) {
            logger.error('❌ Error saving post', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Create vote options for a post
     * @param tx Transaction containing vote option data
     * @param post_txid Post transaction ID that these vote options belong to
     * @returns Array of created vote options
     */
    public async create_vote_options(
        tx: ParsedTransaction,
        post_txid: string
    ): Promise<VoteOption[]> {
        if (!tx || !tx.tx_id || !post_txid) {
            throw new Error('Invalid transaction or post data');
        }
        
        try {
            const metadata = tx.metadata as PostMetadata;
            
            if (!metadata || !metadata.vote_options || !Array.isArray(metadata.vote_options)) {
                logger.debug('👀 No vote options to create', { tx_id: tx.tx_id });
                return [];
            }
            
            // First, get the post to get its ID
            const post = await this.get_post(post_txid);
            
            if (!post || !post.id) {
                logger.error('🚨 Post not found for vote options', { post_txid });
                
                // Try to create the post if it doesn't exist (recovery mechanism)
                logger.info('🔄 Attempting to create missing post for vote options', { post_txid });
                
                const recoveryPost = await this.create_or_update_post({
                    ...tx,
                    metadata: {
                        ...tx.metadata as any,
                        post_txid: post_txid,
                        is_vote: true
                    }
                });
                
                if (!recoveryPost) {
                    throw new Error('Failed to create missing post for vote options');
                }
                
                logger.info('✅ Created missing post for vote options', { post_id: recoveryPost.id });
                return await this.create_vote_options(tx, post_txid); // Retry with the new post
            }
            
            logger.debug('📝 Creating vote options', { 
                tx_id: tx.tx_id,
                post_txid,
                count: metadata.vote_options.length
            });
            
            // Log vote options before creating
            logger.info('📊 Vote options data', {
                tx_id: tx.tx_id,
                post_id: post.id,
                options: metadata.vote_options
            });
            
            // Prepare vote option data
            const vote_option_data = metadata.vote_options.map((option, index) => {
                // Handle both string options and object options with text property
                const optionContent = typeof option === 'string' 
                    ? option 
                    : (option?.text || option?.content || `Option ${index + 1}`);
                
                return {
                    tx_id: `${tx.tx_id}_option_${index}`,
                    post_id: post.id,
                    content: optionContent,
                    option_index: index
                };
            });
            
            // Create vote options
            const vote_options = await this.with_fresh_client(async (client) => {
                // First, delete any existing vote options for this post
                await client.vote_option.deleteMany({
                    where: { post_id: post.id }
                });
                
                // Then create the new vote options
                const options: VoteOption[] = [];
                
                for (const option of vote_option_data) {
                    const created_option = await client.vote_option.create({
                        data: option
                    });
                    options.push(created_option);
                }
                
                return options;
            });
            
            logger.debug('✅ Vote options created', { 
                post_txid,
                count: vote_options.length
            });
            
            return vote_options;
        } catch (error) {
            logger.error('❌ Error creating vote options', {
                tx_id: tx.tx_id,
                post_txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get a post from the database
     * @param post_txid Post transaction ID
     * @param include_vote_options Whether to include vote options
     * @returns Post or null if not found
     */
    public async get_post(
        post_txid: string,
        include_vote_options = false
    ): Promise<Post | null> {
        if (!post_txid) {
            throw new Error('Invalid post transaction ID');
        }
        
        try {
            logger.debug('🔍 Getting post', { post_txid });
            
            // Get the post
            const post = await this.with_fresh_client(async (client) => {
                return await client.post.findUnique({
                    where: { tx_id: post_txid },
                    include: {
                        vote_options: include_vote_options
                    }
                });
            });
            
            if (!post) {
                logger.debug('👀 Post not found', { post_txid });
                return null;
            }
            
            logger.debug('📝 Post found', { post_txid });
            
            return post;
        } catch (error) {
            logger.error('❌ Error getting post', {
                post_txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    
    /**
     * Clean up all vote options from the database
     * @returns Promise<void>
     */
    public async cleanup_vote_options(): Promise<void> {
        try {
            logger.info('🧹 Cleaning up all vote options');
            
            const deleted = await this.with_fresh_client(async (client) => {
                return await client.vote_option.deleteMany({});
            });
            
            logger.info(`✅ Successfully deleted ${deleted.count} vote options`);
        } catch (error) {
            logger.error('❌ Error cleaning up vote options', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    
    /**
     * Clean up all posts from the database
     * @returns Promise<void>
     */
    public async cleanup_posts(): Promise<void> {
        try {
            logger.info('🧹 Cleaning up all posts');
            
            const deleted = await this.with_fresh_client(async (client) => {
                return await client.post.deleteMany({});
            });
            
            logger.info(`✅ Successfully deleted ${deleted.count} posts`);
        } catch (error) {
            logger.error('❌ Error cleaning up posts', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
}
