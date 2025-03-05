import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';
import { MainParser } from './src/parser/main_parser.js';

async function testRealTransaction() {
  const prisma = new PrismaClient();
  const mainParser = new MainParser();
  
  try {
    // Test with a specific transaction ID from the example
    const testTxId = 'f3d1d14d8a42a6b7e81b43cb9c122920f99cc945dcdf4ac1739a1deebbf3029a';
    
    logger.info('🧪 Testing content extraction with real transaction', { tx_id: testTxId });
    
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
    
    // Check if the transaction was saved with the correct content
    const tx = await prisma.processed_transaction.findUnique({
      where: { tx_id: testTxId }
    });
    
    if (tx) {
      const metadata = tx.metadata as any;
      logger.info('📊 Transaction metadata', { 
        tx_id: tx.tx_id,
        content: metadata.content || '❌ No content in metadata',
        metadata_keys: Object.keys(metadata)
      });
    } else {
      logger.error('❌ Transaction not found after parsing', { tx_id: testTxId });
    }
    
    // Check if the post was saved with the correct content
    const post = await prisma.post.findFirst({
      where: { tx_id: testTxId }
    });
    
    if (post) {
      logger.info('📝 Post data', { 
        tx_id: post.tx_id,
        content: post.content || '❌ No content in post',
        author_address: post.author_address || '❌ No author address in post'
      });
    } else {
      logger.error('❌ Post not found after parsing', { tx_id: testTxId });
    }
    
  } catch (error) {
    logger.error('❌ Error testing content extraction', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

testRealTransaction().catch(e => {
  logger.error(e);
  process.exit(1);
});
