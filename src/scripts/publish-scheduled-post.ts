import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Manually publish a scheduled post by its ID
 * @param post_id The ID of the post to publish
 */
async function publishScheduledPost(post_id: string) {
  try {
    logger.info(`Attempting to publish scheduled post: ${post_id}`);
    
    // Find the post
    const post = await prisma.post.findUnique({
      where: { id: post_id }
    });
    
    if (!post) {
      logger.error(`Post not found: ${post_id}`);
      return { success: false, error: 'Post not found' };
    }
    
    // Check if it has scheduled metadata
    const metadata = post.metadata as Record<string, any> | null;
    if (!metadata || !metadata.scheduled) {
      logger.error(`Post ${post_id} does not have scheduled metadata`);
      return { success: false, error: 'Post is not scheduled' };
    }
    
    logger.info(`Found scheduled post ${post_id}`, {
      content: post.content.substring(0, 50) + (post.content.length > 50 ? '...' : ''),
      scheduled_at: metadata.scheduled.scheduledAt,
      timezone: metadata.scheduled.timezone || 'UTC'
    });
    
    // Update the metadata to remove scheduled info
    const updatedMetadata = { ...metadata };
    updatedMetadata.published_scheduled_info = metadata.scheduled;
    delete updatedMetadata.scheduled;
    
    // Update the post
    const updatedPost = await prisma.post.update({
      where: { id: post_id },
      data: {
        metadata: updatedMetadata
      }
    });
    
    logger.info(`Successfully published scheduled post ${post_id}`);
    
    return { 
      success: true, 
      post: updatedPost,
      message: `Post ${post_id} has been published`
    };
  } catch (error) {
    logger.error(`Error publishing scheduled post ${post_id}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = new URL(import.meta.url).pathname;
  const executedFilePath = process.argv[1];
  
  if (modulePath === executedFilePath || modulePath === '/' + executedFilePath) {
    // Get post_id from command line arguments
    const post_id = process.argv[2];
    
    if (!post_id) {
      logger.error('Please provide a post ID as a command line argument');
      process.exit(1);
    }
    
    publishScheduledPost(post_id)
      .then((result) => {
        if (result.success) {
          logger.info('Post published successfully:', result.message);
        } else {
          logger.error('Failed to publish post:', result.error);
        }
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        logger.error('Script failed:', error);
        process.exit(1);
      });
  }
}

export { publishScheduledPost }; 