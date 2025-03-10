/**
 * Simple test script for binary data handling
 */
import { TransactionDataParser } from '../parser/transaction_data_parser.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testSimpleBinaryHandling() {
    try {
        logger.info('🧪 Starting simple binary data test');
        
        // Create parser instance
        const parser = new TransactionDataParser();
        
        // Load the transaction from file
        const txId = '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d';
        const txFilePath = path.join(__dirname, '..', 'parser', `${txId}.json`);
        
        if (!fs.existsSync(txFilePath)) {
            logger.error(`❌ Transaction file not found: ${txFilePath}`);
            return;
        }
        
        logger.info(`📋 Loading transaction from file: ${txFilePath}`);
        const fileContent = fs.readFileSync(txFilePath, 'utf8');
        const txData = JSON.parse(fileContent);
        
        // Extract data from transaction
        logger.info('🔍 Extracting data from transaction');
        const extractedData = parser.extract_data_from_transaction(txData);
        
        logger.info('📊 Extracted data summary', {
            item_count: extractedData.length,
            first_few_items: extractedData.slice(0, 5)
        });
        
        // Process the extracted data
        logger.info('🔍 Processing transaction data');
        const processedData = parser.process_transaction_data(extractedData, txId);
        
        logger.info('📊 Processed data', {
            content: processedData.content,
            is_vote: processedData.is_vote,
            post_id: processedData.post_id,
            tags: processedData.tags,
            lock_amount: processedData.lock_amount,
            lock_duration: processedData.lock_duration
        });
        
        logger.info('✅ Simple binary data test completed');
    } catch (error) {
        logger.error('❌ Error in simple binary data test', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    }
}

// Run the test
testSimpleBinaryHandling().catch(error => {
    logger.error('❌ Unhandled error in test script', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });
});
