import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkScheduledPosts() {
  try {
    // Find all posts with scheduled_at not null
    const scheduledPosts = await prisma.post.findMany({
      where: {
        scheduled_at: {
          not: null
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    console.log(`Found ${scheduledPosts.length} scheduled posts:`);
    
    if (scheduledPosts.length === 0) {
      console.log('No scheduled posts found.');
      
      // Find the 5 most recent posts
      console.log('\nChecking 5 most recent posts:');
      const recentPosts = await prisma.post.findMany({
        orderBy: {
          created_at: 'desc'
        },
        take: 5
      });
      
      for (const post of recentPosts) {
        console.log(`\nID: ${post.id}`);
        console.log(`Content: ${post.content}`);
        console.log(`Created at: ${new Date(post.created_at).toString()}`);
        console.log(`Scheduled at: ${post.scheduled_at ? new Date(post.scheduled_at).toString() : 'None'}`);
        console.log(`tx_id: ${post.tx_id}`);
        console.log('Metadata:', post.metadata);
        
        // Check if this post has scheduled metadata but null scheduled_at
        if (!post.scheduled_at && post.metadata && post.metadata.scheduled) {
          console.log('\n*** FOUND ISSUE: Post has scheduled metadata but null scheduled_at ***');
        }
      }
      
      return;
    }
    
    for (const post of scheduledPosts) {
      console.log(`\nID: ${post.id}`);
      console.log(`Content: ${post.content}`);
      console.log(`Created at: ${new Date(post.created_at).toString()}`);
      console.log(`Scheduled at: ${new Date(post.scheduled_at).toString()}`);
      console.log(`tx_id: ${post.tx_id}`);
      console.log('Metadata:', post.metadata);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkScheduledPosts()
  .then(() => console.log('\nCheck completed'))
  .catch(console.error); 