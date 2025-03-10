import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';

interface TagManagerOptions {
  batchSize?: number;
  updateExisting?: boolean;
  verifyOnly?: boolean;
}

/**
 * Main tag manager class that handles all tag-related operations
 */
export class TagManager {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Generate tags for posts
   */
  async generateTags(options: TagManagerOptions = {}) {
    try {
      logger.info('Starting tag generation');

      const batchSize = options.batchSize || 100;
      let processedCount = 0;
      let updatedCount = 0;

      // Get posts without tags
      const posts = await this.prisma.post.findMany({
        where: {
          OR: [
            { tags: { isEmpty: true } },
            { tags: { equals: [] } }
          ]
        },
        take: batchSize
      });

      logger.info(`Found ${posts.length} posts without tags`);

      // Process each post
      for (const post of posts) {
        try {
          // Extract tags from content
          const tags = await this.extractTagsFromContent(post.content);

          if (tags.length > 0) {
            // Update post with tags
            await this.prisma.post.update({
              where: { id: post.id },
              data: { tags }
            });

            // Update tag usage counts
            await this.updateTagUsage(tags);

            updatedCount++;
          }

          processedCount++;
        } catch (error) {
          logger.error(`Error processing post ${post.id}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('Finished generating tags', {
        processed: processedCount,
        updated: updatedCount
      });

      return { processedCount, updatedCount };
    } finally {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Extract tags from content using simple rules
   */
  private async extractTagsFromContent(content: string): Promise<string[]> {
    const tags: Set<string> = new Set();

    // Extract hashtags
    const hashtagRegex = /#(\w+)/g;
    const hashtags = content.match(hashtagRegex);
    if (hashtags) {
      hashtags.forEach(tag => tags.add(tag.slice(1).toLowerCase()));
    }

    // Extract keywords (simple implementation)
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const commonWords = new Set(['this', 'that', 'there', 'here', 'what', 'when', 'where', 'who', 'which']);
    words.forEach(word => {
      if (!commonWords.has(word)) {
        tags.add(word);
      }
    });

    return Array.from(tags);
  }

  /**
   * Update tag usage counts
   */
  private async updateTagUsage(tags: string[]) {
    for (const tag of tags) {
      await this.prisma.tag.upsert({
        where: { name: tag },
        create: {
          name: tag,
          usage_count: 1
        },
        update: {
          usage_count: { increment: 1 }
        }
      });
    }
  }

  /**
   * Verify tag system
   */
  async verifyTagSystem() {
    try {
      logger.info('Starting tag system verification');

      // Check tag table
      const tagCount = await this.prisma.tag.count();
      const postsWithTags = await this.prisma.post.count({
        where: {
          tags: { isEmpty: false }
        }
      });

      // Get tag usage statistics
      const tagStats = await this.prisma.tag.findMany({
        orderBy: { usage_count: 'desc' },
        take: 10
      });

      const verificationResults = {
        total_tags: tagCount,
        posts_with_tags: postsWithTags,
        top_tags: tagStats.map(tag => ({
          name: tag.name,
          usage_count: tag.usage_count
        }))
      };

      logger.info('Tag system verification complete', verificationResults);

      return verificationResults;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Clean up invalid tags
   */
  async cleanupTags() {
    try {
      logger.info('Starting tag cleanup');

      // Remove tags with no usage
      const removedCount = await this.prisma.tag.deleteMany({
        where: { usage_count: 0 }
      });

      // Update tag counts
      const tags = await this.prisma.tag.findMany();
      for (const tag of tags) {
        const actualCount = await this.prisma.post.count({
          where: {
            tags: { has: tag.name }
          }
        });

        if (actualCount !== tag.usage_count) {
          await this.prisma.tag.update({
            where: { id: tag.id },
            data: { usage_count: actualCount }
          });
        }
      }

      logger.info('Tag cleanup complete', {
        removed_tags: removedCount
      });

      return { removedCount };
    } finally {
      await this.prisma.$disconnect();
    }
  }
} 