import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';

async function checkAuthorAddresses() {
  const prisma = new PrismaClient();
  
  try {
    // Get all posts from the database
    const posts = await prisma.post.findMany({
      select: {
        tx_id: true,
        author_address: true
      }
    });
    
    logger.info(`📊 Found ${posts.length} posts in database`);
    
    // Print each post with author address
    posts.forEach((post) => {
      logger.info(`📝 Post TX ID: ${post.tx_id}`, {
        author_address: post.author_address || '❌ NULL'
      });
    });
    
    // Get all processed transactions
    const transactions = await prisma.processed_transaction.findMany({
      select: {
        tx_id: true,
        metadata: true
      }
    });
    
    logger.info(`📊 Found ${transactions.length} processed transactions in database`);
    
    // Check for author_address in metadata
    let transactionsWithAuthorAddress = 0;
    
    transactions.forEach((tx) => {
      const metadata = tx.metadata as any;
      if (metadata && metadata.author_address) {
        transactionsWithAuthorAddress++;
        logger.info(`🔍 Transaction with author_address in metadata:`, {
          tx_id: tx.tx_id,
          author_address: metadata.author_address
        });
      }
    });
    
    logger.info(`📊 Found ${transactionsWithAuthorAddress} transactions with author_address in metadata`);
    
  } catch (error) {
    logger.error(`❌ Error checking author addresses:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAuthorAddresses().catch(e => {
  logger.error(e);
  process.exit(1);
});
