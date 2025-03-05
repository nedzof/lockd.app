import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';

const TARGET_TX_ID = '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d';

async function checkTransaction() {
  const prisma = new PrismaClient();
  
  try {
    // Check if the transaction exists in processed_transaction table
    const transaction = await prisma.processed_transaction.findUnique({
      where: {
        tx_id: TARGET_TX_ID
      }
    });
    
    if (transaction) {
      logger.info(`Transaction found in processed_transaction table:`, transaction);
    } else {
      logger.info(`Transaction ${TARGET_TX_ID} not found in processed_transaction table`);
    }
    
    // Check if the post exists in post table
    const post = await prisma.post.findUnique({
      where: {
        tx_id: TARGET_TX_ID
      }
    });
    
    if (post) {
      logger.info(`Post found in post table:`, post);
    } else {
      logger.info(`Post with tx_id ${TARGET_TX_ID} not found in post table`);
    }
    
    // Check all posts in the database
    const allPosts = await prisma.post.findMany({
      take: 10,
      orderBy: {
        created_at: 'desc'
      }
    });
    
    logger.info(`Latest 10 posts in the database:`, allPosts);
    
  } catch (error) {
    logger.error(`Error checking transaction:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTransaction().catch(e => {
  logger.error(e);
  process.exit(1);
});
