import { PrismaClient } from '@prisma/client';
import logger from '../services/logger';

const prisma = new PrismaClient();

async function viewPosts() {
  logger.info('Viewing all posts in database');
  
  try {
    const posts = await prisma.post.findMany({
      include: {
        vote_options: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    
    logger.info(`Found ${posts.length} posts`);
    
    for (const post of posts) {
      console.log('\n=== POST ===');
      console.log(`ID: ${post.id}`);
      console.log(`Content: ${post.content}`);
      console.log(`Author: ${post.author_address || 'Unknown'}`);
      console.log(`Created: ${post.created_at}`);
      
      // Safely access properties that might not exist in the type definition
      if ('updated_at' in post) {
        console.log(`Updated: ${post.updated_at}`);
      }
      
      if ('tx_id' in post) {
        console.log(`TX ID: ${post.tx_id}`);
      }
      
      if ('has_image' in post) {
        console.log(`Has Image: ${post.has_image ? 'Yes' : 'No'}`);
      }
      
      if (post.vote_options && post.vote_options.length > 0) {
        console.log('\nVote Options:');
        for (const option of post.vote_options) {
          console.log(`  [${option.option_index}] ${option.content}`);
        }
      }
      
      console.log('=============');
    }
    
    logger.info('View posts completed');
  } catch (error) {
    logger.error('Error viewing posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

viewPosts().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
}); 