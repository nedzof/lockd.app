import { PrismaClient } from '@prisma/client';
import { DbClient } from './src/db/index';
import { logger } from './src/utils/logger';

async function testPostCreation() {
  try {
    // Initialize the database client
    const dbClient = DbClient.get_instance();
    
    // Test transaction data
    const testTx = {
      tx_id: '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d',
      block_height: 886623,
      block_time: 1741125612,
      type: 'post',
      metadata: {
        post_txid: '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d',
        content: 'Test post content',
        author_address: 'test_address',
        is_vote: true,
        is_locked: false,
        vote_options: [
          'Option 1',
          'Option 2',
          'Option 3'
        ]
      }
    };
    
    // Process the transaction (this will create or update the post)
    const result = await dbClient.process_transaction(testTx);
    
    logger.info('Transaction processed successfully', { 
      result
    });
    
    // Get the post to verify
    const post = await dbClient.get_post(testTx.tx_id, true); // Include vote options
    
    logger.info('Retrieved post', { 
      post
    });
    
  } catch (error) {
    logger.error('Error in test', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Run the test
testPostCreation().catch(console.error);
