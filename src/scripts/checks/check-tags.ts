import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';

async function check_tags() {
  const prisma = new PrismaClient();
  
  try {
    // Check tags table
    const tags = await prisma.tag.findMany({
      orderBy: {
        usage_count: 'desc'
      },
      take: 10
    });
    
    logger.info('Top 10 Tags:', {
      tags: tags.map(tag => ({
        name: tag.name,
        usage_count: tag.usage_count,
        created_at: tag.created_at
      }))
    });

    // Check posts with tags
    const posts = await prisma.post.findMany({
      where: {
        tags: {
          isEmpty: false
        }
      },
      select: {
        id: true,
        content: true,
        tags: true,
        metadata: true,
        is_vote: true
      },
      take: 5
    });
    
    logger.info('Latest Posts with Tags:', {
      posts: posts.map(post => ({
        id: post.id,
        content: post.content,
        is_vote: post.is_vote,
        tags: post.tags,
        extracted_tags: post.metadata?.extracted_tags,
        original_tags: post.metadata?.original_tags
      }))
    });

    // Check vote options with tags
    const vote_options = await prisma.vote_option.findMany({
      where: {
        tags: {
          isEmpty: false
        }
      },
      select: {
        id: true,
        content: true,
        tags: true,
        post_id: true
      },
      take: 5
    });
    
    logger.info('Latest Vote Options with Tags:', {
      options: vote_options.map(option => ({
        id: option.id,
        content: option.content,
        tags: option.tags,
        post_id: option.post_id
      }))
    });

  } catch (error) {
    logger.error('Error checking tags:', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
check_tags().catch(console.error); 