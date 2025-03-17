import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Job to process scheduled posts
 * This job checks for posts that are scheduled to be published and publishes them
 * when the scheduled time has arrived
 */
export async function processScheduledPosts() {
  try {
    logger.info('Starting scheduled posts processing job');
    
    // Find all posts with scheduled metadata where the scheduled time has passed
    const now = new Date();
    
    // Get all posts and filter them in memory
    const allPosts = await prisma.post.findMany();
    
    // Filter posts that have scheduled metadata
    const postsWithScheduledMetadata = allPosts.filter(post => {
      const metadata = post.metadata as Record<string, any> | null;
      return metadata && metadata.scheduled;
    });
    
    logger.info(`Found ${postsWithScheduledMetadata.length} posts with scheduled metadata`);
    
    // Filter posts that are ready to be published
    const postsToPublish = postsWithScheduledMetadata.filter(post => {
      try {
        const metadata = post.metadata as Record<string, any>;
        if (!metadata.scheduled || !metadata.scheduled.scheduledAt) {
          return false;
        }
        
        const scheduledAt = new Date(metadata.scheduled.scheduledAt);
        return scheduledAt <= now;
      } catch (error) {
        logger.error(`Error processing scheduled post ${post.id}:`, error);
        return false;
      }
    });
    
    logger.info(`Found ${postsToPublish.length} posts ready to be published`);
    
    // Publish each post
    for (const post of postsToPublish) {
      try {
        // Update the post to remove the scheduled metadata
        const metadata = { ...(post.metadata as Record<string, any>) };
        
        // Store the original scheduled info in a new field for record-keeping
        metadata.published_scheduled_info = metadata.scheduled;
        delete metadata.scheduled;
        
        await prisma.post.update({
          where: { id: post.id },
          data: {
            metadata
          }
        });
        
        logger.info(`Published scheduled post ${post.id}`);
      } catch (error) {
        logger.error(`Error publishing scheduled post ${post.id}:`, error);
      }
    }
    
    logger.info('Completed scheduled posts processing job');
    return { processed: postsToPublish.length };
  } catch (error) {
    logger.error('Error in scheduled posts processing job:', error);
    throw error;
  }
}

// If this file is run directly, execute the job
if (import.meta.url.startsWith('file:')) {
  const modulePath = new URL(import.meta.url).pathname;
  const executedFilePath = process.argv[1];
  
  // Check if this module is being executed directly
  if (modulePath === executedFilePath || modulePath === '/' + executedFilePath) {
    processScheduledPosts()
      .then(result => {
        logger.info('Scheduled posts job completed:', result);
        process.exit(0);
      })
      .catch(error => {
        logger.error('Scheduled posts job failed:', error);
        process.exit(1);
      });
  }
} 