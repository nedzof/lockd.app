// Test script for scheduled posts
import { PrismaClient } from '@prisma/client';

// Create a new PrismaClient instance
const prisma = new PrismaClient();

async function checkScheduledPosts() {
  try {
    console.log('Starting scheduled posts check');
    
    // Get all posts
    const allPosts = await prisma.post.findMany();
    console.log(`Found ${allPosts.length} total posts`);
    
    // Filter posts that have scheduled metadata
    const scheduledPosts = allPosts.filter(post => {
      const metadata = post.metadata;
      return metadata && metadata.scheduled;
    });
    
    console.log(`Found ${scheduledPosts.length} posts with scheduled metadata`);
    
    // Display details for each scheduled post
    for (const post of scheduledPosts) {
      const metadata = post.metadata;
      const scheduledInfo = metadata.scheduled;
      
      console.log('Scheduled post details:', {
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
        console.log(`Post ${post.id} scheduled time has passed (${scheduledAt.toISOString()}), but post is still marked as scheduled`);
      } else {
        console.log(`Post ${post.id} is scheduled for future publication (${scheduledAt.toISOString()})`);
      }
    }
    
    console.log('Scheduled posts check completed');
  } catch (error) {
    console.error('Error checking scheduled posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
checkScheduledPosts()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 