import prisma from '../db';
import { logger } from '../utils/logger';
import { LocalDeepseekService } from './localDeepseekService';

/**
 * Service for managing tags in the database with integration to the LocalDeepseekService
 */
export class TagDatabaseService {
  private deepseekService: LocalDeepseekService;
  
  constructor() {
    this.deepseekService = new LocalDeepseekService();
  }
  
  /**
   * Generates tags for content and stores them in the database
   * @param content The content to generate tags for
   * @returns Array of generated tags
   */
  async generateAndStoreTags(content: string): Promise<string[]> {
    try {
      logger.info(`Generating tags for content (${content.length} characters)`);
      
      // Generate tags using LocalDeepseekService
      const tags = await this.deepseekService.generateTags(content);
      
      // Store tags in the database
      await this.storeTags(tags, 'ai_generated');
      
      logger.info(`Generated and stored ${tags.length} tags using ${this.deepseekService.is_using_fallback() ? 'fallback' : 'AI'} mode`);
      return tags;
    } catch (error) {
      logger.error('Error generating and storing tags:', error);
      return [];
    }
  }
  
  /**
   * Stores tags in the database
   * @param tags Array of tag names to store
   * @param type The type of tags (e.g., 'ai_generated', 'user_created', 'current_event')
   */
  async storeTags(tags: string[], type: string = 'ai_generated'): Promise<void> {
    try {
      // Filter out empty tags
      const validTags = tags.filter(tag => tag && tag.trim().length > 0);
      
      if (validTags.length === 0) {
        logger.info('No valid tags to store');
        return;
      }
      
      // Create or update tags in the database
      const operations = validTags.map(tag => {
        const normalizedTag = tag.trim().toLowerCase();
        
        return prisma.tag.upsert({
          where: { name: normalizedTag },
          update: { 
            type,
            usage_count: { increment: 1 },
            updated_at: new Date()
          },
          create: {
            name: normalizedTag,
            type,
            usage_count: 1,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      });
      
      await Promise.all(operations);
      logger.info(`Stored ${validTags.length} tags of type '${type}'`);
    } catch (error) {
      logger.error('Error storing tags:', error);
    }
  }
  
  /**
   * Applies generated tags to a post
   * @param post_id The ID of the post to apply tags to
   * @param content The content to generate tags from
   * @returns Array of applied tags
   */
  async applyTagsToPost(post_id: string, content: string): Promise<string[]> {
    try {
      // Generate tags
      const tags = await this.generateAndStoreTags(content);
      
      if (tags.length === 0) {
        logger.warn(`No tags generated for post ${post_id}`);
        return [];
      }
      
      // Update post with new tags
      await prisma.post.update({
        where: { id: post_id },
        data: { tags }
      });
      
      logger.info(`Applied ${tags.length} tags to post ${post_id}`);
      return tags;
    } catch (error) {
      logger.error(`Error applying tags to post ${post_id}:`, error);
      return [];
    }
  }
  
  /**
   * Gets popular tags from the database
   * @param limit Maximum number of tags to return
   * @returns Array of tag objects
   */
  async getPopularTags(limit: number = 20): Promise<any[]> {
    try {
      const tags = await prisma.tag.findMany({
        orderBy: {
          usage_count: 'desc'
        },
        take: limit
      });
      
      logger.info(`Retrieved ${tags.length} popular tags`);
      return tags;
    } catch (error) {
      logger.error('Error getting popular tags:', error);
      return [];
    }
  }
  
  /**
   * Gets tags by type
   * @param type The type of tags to retrieve
   * @param limit Maximum number of tags to return
   * @returns Array of tag objects
   */
  async getTagsByType(type: string, limit: number = 20): Promise<any[]> {
    try {
      const tags = await prisma.tag.findMany({
        where: {
          type
        },
        orderBy: {
          usage_count: 'desc'
        },
        take: limit
      });
      
      logger.info(`Retrieved ${tags.length} tags of type '${type}'`);
      return tags;
    } catch (error) {
      logger.error(`Error getting tags of type '${type}':`, error);
      return [];
    }
  }
  
  /**
   * Updates tag statistics in the Stats table
   */
  async updateTagStatistics(): Promise<void> {
    try {
      // Get all tags
      const tags = await prisma.tag.findMany({
        orderBy: {
          usage_count: 'desc'
        }
      });
      
      // Log tag statistics
      logger.info(`Total tags: ${tags.length}`);
      
      if (tags.length > 0) {
        const topTags = tags.slice(0, 5);
        logger.info(`Top 5 tags: ${topTags.map(tag => `${tag.name} (${tag.usage_count})`).join(', ')}`);
      }
    } catch (error) {
      logger.error('Error updating tag statistics:', error);
    }
  }
}
