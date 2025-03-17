import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function checkScheduledPosts() {
  try {
    logger.info('Starting scheduled posts check');
    
    // Get all posts
    const allPosts = await prisma.post.findMany();
    logger.info(`Found ${allPosts.length} total posts`);
    
    // Filter posts that have scheduled metadata
    const scheduledPosts = allPosts.filter(post => {
      const metadata = post.metadata as Record<string, any> | null;
      return metadata && metadata.scheduled;
    });
    
    logger.info(`Found ${scheduledPosts.length} posts with scheduled metadata`);
    
    // Display details for each scheduled post
    for (const post of scheduledPosts) {
      const metadata = post.metadata as Record<string, any>;
      const scheduledInfo = metadata.scheduled;
      
      logger.info('Scheduled post details:', {
        post_id: post.id,
        tx_id: post.tx_id,
        content: post.content.substring(0, 50) + (post.content.length > 50 ? '...' : ''),
        created_at: post.created_at,
        scheduled_at: scheduledInfo.scheduledAt,
        timezone: scheduledInfo.timezone || 'UTC',
        tags: post.tags
      });
      
      // Check if the scheduled time has passed
      const scheduledAt = new Date(scheduledInfo.scheduledAt);
      const now = new Date();
      
      if (scheduledAt <= now) {
        logger.info(`Post ${post.id} scheduled time has passed (${scheduledAt.toISOString()}), but post is still marked as scheduled`);
      } else {
        logger.info(`Post ${post.id} is scheduled for future publication (${scheduledAt.toISOString()})`);
      }
    }
    
    logger.info('Scheduled posts check completed');
  } catch (error) {
    logger.error('Error checking scheduled posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = new URL(import.meta.url).pathname;
  const executedFilePath = process.argv[1];
  
  if (modulePath === executedFilePath || modulePath === '/' + executedFilePath) {
    checkScheduledPosts()
      .then(() => {
        logger.info('Script completed');
        process.exit(0);
      })
      .catch(error => {
        logger.error('Script failed:', error);
        process.exit(1);
      });
  }
}

export { checkScheduledPosts }; 