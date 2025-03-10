/**
 * Test script to verify scanner's handling of binary data in transactions
 */
import { Scanner } from '../services/scanner.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testScannerBinaryDataHandling() {
    try {
        logger.info('🧪 Starting scanner binary data handling test');
        
        // Create a scanner instance
        const scanner = new Scanner();
        
        // Load the problematic transaction ID from the logs
        const txId = '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d';
        
        logger.info(`🔍 Testing scanner with transaction ${txId}`);
        
        // Process the transaction
        await scanner.processTransaction(txId);
        
        // Give some time for processing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info('✅ Scanner binary data handling test completed');
        
        // Clean up
        await scanner.stop();
    } catch (error) {
        logger.error('❌ Error in scanner binary data handling test', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    }
}

// Run the test
testScannerBinaryDataHandling().catch(error => {
    logger.error('❌ Unhandled error in test script', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });
});
