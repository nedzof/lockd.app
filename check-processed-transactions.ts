import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';

async function checkProcessedTransactions() {
  const prisma = new PrismaClient();
  
  try {
    // Get all processed transactions
    const transactions = await prisma.processed_transaction.findMany({
      select: {
        tx_id: true,
        metadata: true
      }
    });
    
    logger.info(`📊 Found ${transactions.length} processed transactions in database`);
    
    // Check for author_address in metadata
    transactions.forEach((tx) => {
      const metadata = tx.metadata as any;
      logger.info(`🔍 Transaction ${tx.tx_id}:`, {
        metadata_keys: Object.keys(metadata),
        has_author_address: metadata.author_address ? '✅' : '❌',
        author_address: metadata.author_address || 'NULL',
        sender_address: metadata.sender_address || 'NULL'
      });
    });
    
  } catch (error) {
    logger.error(`❌ Error checking processed transactions:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProcessedTransactions().catch(e => {
  logger.error(e);
  process.exit(1);
});
