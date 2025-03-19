import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkRecentPosts() {
  try {
    // Get 5 most recent posts
    const recentPosts = await prisma.post.findMany({
      orderBy: {
        created_at: 'desc'
      },
      take: 5
    });
    
    console.log(`Retrieved ${recentPosts.length} recent posts`);
    
    // Examine each post
    recentPosts.forEach((post, index) => {
      console.log(`\nPost #${index + 1}:`);
      console.log(`ID: ${post.id}`);
      console.log(`Created at: ${post.created_at}`);
      console.log(`Content: ${post.content.slice(0, 50)}${post.content.length > 50 ? '...' : ''}`);
      console.log(`Scheduled at: ${post.scheduled_at || 'None'}`);
      console.log(`Has metadata: ${post.metadata ? 'Yes' : 'No'}`);
      
      if (post.metadata) {
        console.log('Metadata keys:', Object.keys(post.metadata));
        if (post.metadata.scheduled) {
          console.log('Scheduled metadata:', post.metadata.scheduled);
        }
      }
    });
  } catch (error) {
    console.error('Error checking recent posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentPosts(); 