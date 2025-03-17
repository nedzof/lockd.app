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
    
    // Use the current time with a small buffer to account for potential timezone issues
    const now = new Date();
    logger.info(`Current time: ${now.toISOString()}`);
    
    // Get all posts and filter them in memory to improve debugging
    const allPosts = await prisma.post.findMany({
      include: {
        vote_options: true
      }
    });
    
    logger.info(`Retrieved ${allPosts.length} total posts from the database`);
    
    // Filter posts that have scheduled metadata
    const postsWithScheduledMetadata = allPosts.filter(post => {
      const metadata = post.metadata as Record<string, any> | null;
      const hasScheduled = metadata && metadata.scheduled;
      
      if (hasScheduled) {
        logger.debug(`Found post with scheduled metadata: ${post.id}`, {
          scheduledInfo: metadata?.scheduled,
          postCreatedAt: post.created_at
        });
      }
      
      return hasScheduled;
    });
    
    logger.info(`Found ${postsWithScheduledMetadata.length} posts with scheduled metadata`);
    
    // Filter posts that are ready to be published
    const postsToPublish = postsWithScheduledMetadata.filter(post => {
      try {
        const metadata = post.metadata as Record<string, any>;
        if (!metadata.scheduled || !metadata.scheduled.scheduledAt) {
          logger.warn(`Post ${post.id} has scheduled metadata but missing scheduledAt property`);
          return false;
        }
        
        const scheduledAt = new Date(metadata.scheduled.scheduledAt);
        
        // Add timezone offset if provided
        if (metadata.scheduled.timezone) {
          try {
            // Simple timezone handling (could be improved with a timezone library)
            const scheduledInLocalTime = new Date(scheduledAt.toLocaleString('en-US', { timeZone: metadata.scheduled.timezone }));
            logger.debug(`Post ${post.id} scheduled time: ${scheduledAt.toISOString()}, local time with timezone ${metadata.scheduled.timezone}: ${scheduledInLocalTime.toISOString()}`);
          } catch (tzError) {
            logger.warn(`Error processing timezone for post ${post.id}:`, tzError);
            // Continue with UTC time if timezone processing fails
          }
        }
        
        const isReady = scheduledAt <= now;
        
        if (isReady) {
          logger.info(`Post ${post.id} is ready to be published (scheduled: ${scheduledAt.toISOString()})`);
        } else {
          logger.debug(`Post ${post.id} is not ready yet (scheduled: ${scheduledAt.toISOString()}, now: ${now.toISOString()})`);
        }
        
        return isReady;
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
        
        logger.info(`Publishing scheduled post ${post.id} with content: "${post.content.substring(0, 50)}..."`);
        
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