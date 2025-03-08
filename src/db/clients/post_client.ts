/**
 * Post Database Client
 * 
 * Handles database operations for posts and vote options.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import BaseDbClient from './base_client.js';

interface Post {
  tx_id: string;
  content: string;
  author_address?: string;
  created_at: Date;
  is_vote?: boolean;
  media_type?: string;
  content_type?: string;
  tags?: string[];
  vote_options?: VoteOption[];
}

interface VoteOption {
  tx_id: string;
  post_id: string;
  content: string;
  option_index: number;
  created_at: Date;
  author_address?: string;
  tags?: string[];
}

export class PostClient extends BaseDbClient {
  constructor() {
    super();
  }
  
  /**
   * Create a new post
   * @param post The post to create
   * @returns The created post
   */
  async create_post(post: Post): Promise<any> {
    try {
      // Create the base post data object with only the fields that are definitely in the schema
      const postData: any = {
        tx_id: post.tx_id,
        content: post.content,
        created_at: post.created_at,
        is_vote: post.is_vote || false,
        tags: post.tags || []
      };
      
      // Add optional fields only if they are provided
      if (post.author_address) postData.author_address = post.author_address;
      if (post.media_type) postData.media_type = post.media_type;
      if (post.content_type) postData.content_type = post.content_type;
      
      // Add vote options if provided
      if (post.vote_options && post.vote_options.length > 0) {
        postData.vote_options = {
          create: post.vote_options.map((option, index) => {
            const voteOptionData: any = {
              tx_id: option.tx_id,
              content: option.content,
              option_index: option.option_index || index,
              created_at: option.created_at,
              tags: option.tags || []
            };
            
            if (option.author_address) voteOptionData.author_address = option.author_address;
            
            return voteOptionData;
          })
        };
      }
      
      return await this.with_retry(() => 
        this.prisma.post.create({
          data: postData,
          include: {
            vote_options: true
          }
        })
      );
    } catch (error) {
      this.log_error('Error creating post', error as Error, {
        tx_id: post.tx_id
      });
      throw error;
    }
  }
  
  /**
   * Get a post by transaction ID
   * @param transactionId The transaction ID of the post
   * @returns The post or null if not found
   */
  async get_post_by_transaction_id(transactionId: string): Promise<any | null> {
    try {
      return await this.with_retry(() => 
        this.prisma.post.findUnique({
          where: {
            tx_id: transactionId
          },
          include: {
            vote_options: true
          }
        })
      );
    } catch (error) {
      this.log_error('Error getting post by transaction ID', error as Error, {
        tx_id: transactionId
      });
      return null;
    }
  }
  
  /**
   * Update an existing post
   * @param transactionId The transaction ID of the post to update
   * @param updates The updates to apply
   * @returns The updated post
   */
  async update_post(transactionId: string, updates: Partial<Post>): Promise<any> {
    try {
      const updateData: any = {};
      
      if (updates.content) updateData.content = updates.content;
      if (updates.author_address) updateData.author_address = updates.author_address;
      if (updates.media_type) updateData.media_type = updates.media_type;
      if (updates.content_type) updateData.content_type = updates.content_type;
      if (updates.tags) updateData.tags = updates.tags;
      if (updates.is_vote !== undefined) updateData.is_vote = updates.is_vote;
      
      return await this.with_retry(() => 
        this.prisma.post.update({
          where: {
            tx_id: transactionId
          },
          data: updateData,
          include: {
            vote_options: true
          }
        })
      );
    } catch (error) {
      this.log_error('Error updating post', error as Error, {
        tx_id: transactionId
      });
      throw error;
    }
  }
  
  /**
   * Add vote options to a post
   * @param postId The ID of the post
   * @param voteOptions The vote options to add
   * @returns The created vote options
   */
  async add_vote_options(postId: string, voteOptions: VoteOption[]): Promise<any[]> {
    try {
      const createdOptions = [];
      
      for (const option of voteOptions) {
        const createdOption = await this.with_retry(() => 
          this.prisma.vote_option.create({
            data: {
              tx_id: option.tx_id,
              post_id: postId,
              content: option.content,
              option_index: option.option_index,
              created_at: option.created_at,
              author_address: option.author_address,
              tags: option.tags || []
            }
          })
        );
        
        createdOptions.push(createdOption);
      }
      
      return createdOptions;
    } catch (error) {
      this.log_error('Error adding vote options', error as Error, {
        post_id: postId
      });
      throw error;
    }
  }
  
  /**
   * Get vote options for a post
   * @param postId The ID of the post
   * @returns The vote options for the post
   */
  async get_vote_options(postId: string): Promise<any[]> {
    try {
      return await this.with_retry(() => 
        this.prisma.vote_option.findMany({
          where: {
            post_id: postId
          }
        })
      );
    } catch (error) {
      this.log_error('Error getting vote options', error as Error, {
        post_id: postId
      });
      return [];
    }
  }
  
  /**
   * Delete all posts
   * @returns The number of deleted posts
   */
  async delete_all_posts(): Promise<number> {
    try {
      const result = await this.with_retry(() => 
        this.prisma.post.deleteMany({})  
      );
      
      this.log_info('Deleted all posts', {
        count: result.count
      });
      
      return result.count;
    } catch (error) {
      this.log_error('Error deleting all posts', error as Error);
      throw error;
    }
  }
  
  /**
   * Delete all vote options
   * @returns The number of deleted vote options
   */
  async delete_all_vote_options(): Promise<number> {
    try {
      const result = await this.with_retry(() => 
        this.prisma.vote_option.deleteMany({})  
      );
      
      this.log_info('Deleted all vote options', {
        count: result.count
      });
      
      return result.count;
    } catch (error) {
      this.log_error('Error deleting all vote options', error as Error);
      throw error;
    }
  }
}

// Export singleton instance
export const post_client = new PostClient();

// Export default for direct instantiation
export default PostClient;
