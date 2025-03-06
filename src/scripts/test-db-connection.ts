/**
 * Test script to verify database connection and transaction saving
 */
import { DbClient } from '../db/index.js';
import { logger } from '../utils/logger.js';

async function testDbConnection() {
    try {
        logger.info('Testing database connection...');
        
        // Create a new DB client
        const db_client = new DbClient();
        
        // Create a test transaction
        const testTx = {
            tx_id: `test-tx-${Date.now()}`,
            content: 'This is a test transaction',
            content_type: 'text',
            block_height: 12345,
            timestamp: new Date().toISOString(),
            type: 'test',
            protocol: 'MAP',
            metadata: {
                test: true,
                created: new Date().toISOString()
            }
        };
        
        logger.info('Attempting to save test transaction', { tx_id: testTx.tx_id });
        
        // Try to save the transaction
        const result = await db_client.process_transaction(testTx);
        
        logger.info('Test transaction saved successfully', { 
            tx_id: result.tx_id,
            id: result.id,
            type: result.type
        });
        
        // Verify we can retrieve the transaction
        const retrieved = await db_client.transaction_client.get_transaction(testTx.tx_id);
        if (retrieved) {
            logger.info('Test transaction retrieved successfully', { 
                tx_id: retrieved.tx_id,
                id: retrieved.id,
                type: retrieved.type
            });
        } else {
            logger.error('Failed to retrieve test transaction');
        }
        
        logger.info('Database connection test completed successfully');
    } catch (error) {
        logger.error('Database connection test failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
    }
}

// Run the test
testDbConnection().catch(error => {
    logger.error('Unhandled error in test script', {
        error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
});
