import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Job to process scheduled posts
 * This job checks for posts that are scheduled to be published and publishes them
 * when the scheduled time has arrived
 */
export async function processScheduledPosts() {
  logger.info('Starting scheduled posts processing job');
  logger.info(`Current time: ${new Date().toISOString()}`);
  
  try {
    // Get all posts
    const posts = await prisma.post.findMany();
    logger.info(`Retrieved ${posts.length} total posts from the database`);
    
    // Find posts that have a scheduled_at date in the past
    const now = new Date();
    const scheduledPosts = posts.filter(post => post.scheduled_at && post.scheduled_at <= now);
    
    logger.info(`Found ${scheduledPosts.length} posts ready to be published`);
    
    // Process each scheduled post
    let processed = 0;
    for (const post of scheduledPosts) {
      try {
        // Get the current metadata
        const metadata = post.metadata as Record<string, any> | null;
        
        // Create updated metadata with published flag
        let updatedMetadata = { ...metadata } || {};
        
        // If there's scheduled info in the metadata, move it to published_scheduled_info
        if (metadata?.scheduled) {
          updatedMetadata.published_scheduled_info = metadata.scheduled;
          updatedMetadata.scheduled = {
            ...metadata.scheduled,
            published: true,
            published_at: new Date().toISOString()
          };
        }
        
        // Update the post to remove the scheduled_at date and update metadata
        await prisma.post.update({
          where: { id: post.id },
          data: {
            scheduled_at: null,
            metadata: updatedMetadata
          }
        });
        
        logger.info(`Successfully published scheduled post ${post.id}`);
        processed++;
      } catch (error) {
        logger.error(`Error publishing scheduled post ${post.id}:`, error);
      }
    }
    
    logger.info('Completed scheduled posts processing job');
    return { processed };
  } catch (error) {
    logger.error('Error processing scheduled posts:', error);
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