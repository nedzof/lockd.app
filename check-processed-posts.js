import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProcessedPosts() {
  try {
    // Find all posts with null scheduled_at but with scheduled metadata
    const posts = await prisma.post.findMany({
      orderBy: {
        created_at: 'desc'
      },
      take: 10
    });
    
    const processedScheduledPosts = posts.filter(post => {
      try {
        return post.scheduled_at === null && 
               post.metadata && 
               post.metadata.scheduled;
      } catch (e) {
        return false;
      }
    });
    
    console.log(`Found ${processedScheduledPosts.length} processed scheduled posts:`);
    
    for (const post of processedScheduledPosts) {
      console.log(`\nID: ${post.id}`);
      console.log(`Content: ${post.content}`);
      console.log(`Created at: ${new Date(post.created_at).toString()}`);
      console.log(`Scheduled at: ${post.scheduled_at ? new Date(post.scheduled_at).toString() : 'None'}`);
      console.log(`tx_id: ${post.tx_id}`);
      console.log('Metadata:', post.metadata);
      
      if (post.metadata?.scheduled?.scheduledAt) {
        const scheduledTime = new Date(post.metadata.scheduled.scheduledAt);
        const now = new Date();
        console.log(`Scheduled time was: ${scheduledTime.toString()}`);
        console.log(`This was ${scheduledTime <= now ? 'in the past' : 'in the future'}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProcessedPosts()
  .then(() => console.log('\nCheck completed'))
  .catch(console.error); 