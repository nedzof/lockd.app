/**
 * Post Repository
 * 
 * Handles database operations for posts
 */

import prisma from '../../db.js';
import logger from '../logger.js';
import type { Prisma } from '@prisma/client';
import type { OrdinalInscription } from '../../shared/types.js';

/**
 * Post Repository class
 * Handles database operations for posts
 */
export class PostRepository {
  /**
   * Convert raw image data from base64 to Bytes
   */
  private base64ToBytes(base64Data: string): Buffer {
    if (!base64Data) return Buffer.from([]);
    
    // Handle data URLs by stripping the prefix
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(',');
      if (parts.length > 1) {
        return Buffer.from(parts[1], 'base64');
      }
    }
    
    return Buffer.from(base64Data, 'base64');
  }

  /**
   * Create a post from a processed transaction
   */
  async createPostFromTransaction(txData: any): Promise<void> {
    try {
      // Ensure we have a valid transaction ID
      const { tx_id, metadata, type, protocol, block_height, block_time } = txData;
      
      if (!tx_id) {
        logger.warn('Cannot create post: No transaction ID provided');
        return;
      }

      // Check if post already exists
      const existingPost = await prisma.post.findUnique({
        where: { tx_id }
      });

      if (existingPost) {
        logger.info(`Post for transaction ${tx_id} already exists, skipping creation`);
        return;
      }

      // Extract post data from metadata
      const content = metadata.content || '';
      const isVote = type === 'vote' || metadata.is_vote === true;
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
      
      // Check for custom metadata that might have been stored separately
      const customMetadata = metadata._custom_metadata || {};
      const isLocked = customMetadata.is_locked === true || (metadata.lock_amount && metadata.lock_amount > 0);
      
      // Extract image data if available
      let mediaType = null;
      let contentTypeValue = null;
      let rawImageData = null;
      let imageMetadata = null;
      
      if (metadata.image_metadata) {
        mediaType = 'image';
        contentTypeValue = metadata.image_metadata.content_type || 
                           metadata.image_metadata.format || 
                           metadata.content_type || 
                           'image/jpeg';
        imageMetadata = metadata.image_metadata;
        
        // Convert base64 image data to bytes if available
        if (metadata.raw_image_data) {
          rawImageData = this.base64ToBytes(metadata.raw_image_data);
        } else if (metadata.image && Buffer.isBuffer(metadata.image)) {
          rawImageData = metadata.image;
        }
      }

      // Use 'as any' to bypass TypeScript type checking
      const postData = {
        tx_id,
        content,
        author_address: metadata.author_address || txData.authorAddress,
        is_vote: isVote,
        media_type: mediaType,
        content_type: contentTypeValue,
        tags,
        media_url: null,
        raw_image_data: rawImageData,
        block_height: block_height || 0,
        metadata: metadata,
        is_locked: isLocked,
        image_metadata: imageMetadata
      } as any;

      const post = await prisma.post.create({ data: postData });

      // If this is a vote, create vote options
      if (isVote) {
        // Check different possible vote option formats
        let voteOptions: any[] = [];
        
        if (Array.isArray(metadata.vote_options)) {
          // Simple string array format
          voteOptions = metadata.vote_options.map((content: string, i: number) => ({ 
            content, 
            index: i 
          }));
        } else if (metadata.options && Array.isArray(metadata.options)) {
          // Object array format
          voteOptions = metadata.options;
        } else if (metadata.vote_data?.options && Array.isArray(metadata.vote_data.options)) {
          // JSON ordinal format
          voteOptions = metadata.vote_data.options;
        }

        if (voteOptions.length > 0) {
          // Create vote options
          for (let i = 0; i < voteOptions.length; i++) {
            const option = voteOptions[i];
            // Handle different formats
            const content = typeof option === 'string' ? option : option.content || '';
            const optionIndex = typeof option === 'object' ? (option.index || i) : i;
            
            await prisma.vote_option.create({
              data: {
                post_id: post.id,
                content: content,
                tx_id: `${tx_id}-${optionIndex}`, // Generate a unique tx_id for each option
                option_index: optionIndex,
                author_address: metadata.author_address || txData.authorAddress,
                tags: []
              }
            });
          }

          logger.info(`Created vote post with ${voteOptions.length} options for transaction ${tx_id}`);
        } else {
          logger.warn(`Vote post created but no options found for transaction ${tx_id}`);
        }
      } else {
        logger.info(`Created post for transaction ${tx_id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create post: ${errorMessage}`);
      
      // Log more detailed information for debugging
      if (error instanceof Error && error.stack) {
        logger.debug(`Error stack trace: ${error.stack}`);
      }
    }
  }

  /**
   * Process a transaction to create or update a post
   */
  async processTransaction(txData: any): Promise<void> {
    try {
      await this.createPostFromTransaction(txData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process transaction for post: ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const post_repository = new PostRepository(); 