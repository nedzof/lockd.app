/**
 * Test script to run the scanner with a specific transaction ID
 */
import { Scanner } from '../services/scanner.js';
import { logger } from '../utils/logger.js';

async function testScannerWithTransaction() {
    try {
        logger.info('🧪 Starting scanner test with specific transaction');
        
        // Create a scanner instance
        const scanner = new Scanner();
        
        // Define the transaction ID to test
        const txId = '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d';
        
        logger.info(`🔍 Processing transaction: ${txId}`);
        
        // Process the transaction
        await scanner.processTransaction(txId);
        
        // Give some time for processing to complete
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        logger.info('✅ Scanner test completed');
        
        // Clean up
        await scanner.stop();
        
        // Exit the process
        process.exit(0);
    } catch (error) {
        logger.error('❌ Error in scanner test', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    }
}

// Run the test
testScannerWithTransaction().catch(error => {
    logger.error('❌ Unhandled error in test script', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
});
