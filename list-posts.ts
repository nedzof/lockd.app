import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';

async function listPosts() {
  const prisma = new PrismaClient();
  
  try {
    // Get all posts from the database
    const posts = await prisma.post.findMany({
      orderBy: {
        created_at: 'desc'
      }
    });
    
    logger.info(`📊 Found ${posts.length} posts in database`);
    
    // Print each post with minimal information
    posts.forEach((post, index) => {
      logger.info(`📝 Post ${index + 1}:`, {
        '📝 TX ID': post.tx_id,
        '📄 Content': post.content,
        '🕰️ Created At': post.created_at,
        '⬆️ Block Height': post.block_height,
        '👥 Author Address': post.author_address || '❌ No author address',
        '👥 Has Author': post.author_address ? '✅' : '❌',
        '🔒 Locked': post.is_locked ? '🔒' : '🔓',
        '🗳️ Vote': post.is_vote ? '🗳️' : '📄',
        '📈 Tags': post.tags
      });
    });
    
  } catch (error) {
    logger.error(`❌ Error listing posts:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

listPosts().catch(e => {
  logger.error(e);
  process.exit(1);
});
