// Test script to create a scheduled post
import { PrismaClient } from '@prisma/client';

// Create a new PrismaClient instance
const prisma = new PrismaClient();

async function createScheduledPost() {
  try {
    console.log('Creating a test scheduled post');
    
    // Create a date 10 minutes in the future
    const scheduledTime = new Date(Date.now() + 10 * 60 * 1000);
    console.log(`Scheduled time: ${scheduledTime.toISOString()}`);
    
    // Create the post in the database
    const post = await prisma.post.create({
      data: {
        tx_id: `test_scheduled_${Date.now()}`,
        content: `This is a test scheduled post created at ${new Date().toISOString()}`,
        author_address: 'test_author',
        created_at: new Date(),
        tags: ['test', 'scheduled'],
        is_vote: false,
        is_locked: false,
        metadata: {
          app: 'lockd.app',
          type: 'content',
          version: '1.0.0',
          scheduled: {
            scheduledAt: scheduledTime.toISOString(),
            timezone: 'UTC'
          }
        }
      }
    });
    
    console.log(`Created scheduled post with ID: ${post.id}`);
    console.log(`The post is scheduled to be published at: ${scheduledTime.toISOString()}`);
    console.log(`Post details:`, {
      id: post.id,
      tx_id: post.tx_id,
      content: post.content,
      created_at: post.created_at,
      metadata: post.metadata
    });
    
    return post;
  } catch (error) {
    console.error('Error creating scheduled post:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
createScheduledPost()
  .then((post) => {
    console.log(`Script completed. Created post ID: ${post.id}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 