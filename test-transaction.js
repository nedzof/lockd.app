import { DbClient } from './src/services/dbClient.js';
import { logger } from './src/utils/logger.js';

async function testGetTransaction() {
  try {
    const dbClient = DbClient.getInstance();
    
    // Connect to the database
    await dbClient.connect();
    
    // Test with a sample transaction ID
    const tx_id = '1b446b7fe364a132cb7b497b9fe828f6cb1c2fd115d5c9abf15a813c4e9fd183';
    const transaction = await dbClient.getTransaction(tx_id);
    
    if (transaction) {
      logger.info('Transaction found:', transaction);
    } else {
      logger.info('Transaction not found');
    }
    
    // Disconnect from the database
    await dbClient.disconnect();
  } catch (error) {
    logger.error('Error in test:', error);
  }
}

testGetTransaction();
