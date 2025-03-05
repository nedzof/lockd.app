import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';
import { MainParser } from './src/parser/main_parser.js';

async function testAuthorAddressFix() {
  const prisma = new PrismaClient();
  const mainParser = new MainParser();
  
  try {
    // Test with a specific transaction ID
    const testTxId = 'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053';
    
    logger.info('🧪 Testing author_address fix with transaction', { tx_id: testTxId });
    
    // Delete existing transaction and post to test fresh parsing
    try {
      await prisma.post.deleteMany({
        where: { tx_id: testTxId }
      });
      
      await prisma.processed_transaction.deleteMany({
        where: { tx_id: testTxId }
      });
      
      logger.info('🧹 Cleared existing transaction and post data', { tx_id: testTxId });
    } catch (error) {
      logger.warn('⚠️ Could not clear existing data', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Parse the transaction
    await mainParser.parse_transaction(testTxId);
    
    // Check if the transaction was saved with author_address
    const tx = await prisma.processed_transaction.findUnique({
      where: { tx_id: testTxId }
    });
    
    if (tx) {
      const metadata = tx.metadata as any;
      logger.info('📊 Transaction metadata', { 
        tx_id: tx.tx_id,
        metadata_keys: Object.keys(metadata),
        author_address: metadata.author_address || '❌ No author address in metadata'
      });
    } else {
      logger.error('❌ Transaction not found after parsing', { tx_id: testTxId });
    }
    
    // Check if the post was saved with author_address
    const post = await prisma.post.findFirst({
      where: { tx_id: testTxId }
    });
    
    if (post) {
      logger.info('📝 Post data', { 
        tx_id: post.tx_id,
        author_address: post.author_address || '❌ No author address in post'
      });
      
      // Check if the post metadata also contains the author_address
      const postMetadata = post.metadata as any;
      logger.info('📝 Post metadata', {
        author_address_in_metadata: postMetadata.author_address || '❌ No author address in post metadata'
      });
    } else {
      logger.error('❌ Post not found after parsing', { tx_id: testTxId });
    }
    
  } catch (error) {
    logger.error('❌ Error testing author_address fix', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

testAuthorAddressFix().catch(e => {
  logger.error(e);
  process.exit(1);
});
