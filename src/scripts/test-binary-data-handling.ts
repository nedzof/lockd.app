/**
 * Test script for diagnosing binary data handling issues in the transaction parser
 */
import { TransactionDataParser } from '../parser/transaction_data_parser.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { VoteTransactionService } from '../services/vote-transaction-service.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up the parser and services
const parser = new TransactionDataParser();
const prisma = new PrismaClient();
const voteService = new VoteTransactionService(prisma);

async function testBinaryDataHandling() {
    try {
        logger.info('🧪 Starting binary data handling test');

        // Load the problematic transaction ID from the logs
        const txId = '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d';
        
        // Try to load the transaction from a local JSON file if available
        let txData;
        const txFilePath = path.join(__dirname, '..', 'parser', `${txId}.json`);
        
        if (fs.existsSync(txFilePath)) {
            logger.info(`📋 Loading transaction from file: ${txFilePath}`);
            const fileContent = fs.readFileSync(txFilePath, 'utf8');
            txData = JSON.parse(fileContent);
        } else {
            logger.info(`🔍 Fetching transaction ${txId} from JungleBus`);
            txData = await parser.fetch_transaction(txId);
            
            if (txData) {
                // Save the transaction data to a file for future reference
                fs.writeFileSync(txFilePath, JSON.stringify(txData, null, 2));
                logger.info(`💾 Saved transaction data to ${txFilePath}`);
            }
        }
        
        if (!txData) {
            logger.error('❌ Failed to load transaction data');
            return;
        }
        
        // Test the data extraction
        logger.info('🔍 Testing data extraction from transaction');
        const extractedData = parser.extract_data_from_transaction(txData);
        
        logger.info('📊 Extracted data summary', {
            item_count: extractedData.length,
            first_few_items: extractedData.slice(0, 5).map(item => 
                item.length > 50 ? item.substring(0, 50) + '...' : item
            )
        });
        
        // Test parsing the transaction
        logger.info('🔍 Testing transaction parsing');
        const parsedData = parser.process_transaction_data(extractedData, txId);
        
        logger.info('📊 Parsed data', {
            content: parsedData.content,
            is_vote: parsedData.is_vote,
            options_hash: parsedData.options_hash,
            post_id: parsedData.post_id,
            tags: parsedData.tags,
        });
        
        // Test if it's a vote transaction
        const isVote = parser.is_vote_transaction(parsedData);
        logger.info(`🗳️ Is vote transaction: ${isVote}`);
        
        if (isVote) {
            // Test vote transaction processing
            logger.info('🔍 Testing vote transaction processing');
            const voteData = await voteService.processVoteTransaction({
                id: txId,
                block_height: 800000,
                block_time: new Date(),
                author_address: '1TestAddress',
                ...parsedData
            });
            
            logger.info('📊 Vote transaction processing result', voteData);
        }
        
        logger.info('✅ Binary data handling test completed');
    } catch (error) {
        logger.error('❌ Error in binary data handling test', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    } finally {
        // Clean up
        await prisma.$disconnect();
    }
}

// Run the test
testBinaryDataHandling().catch(error => {
    logger.error('❌ Unhandled error in test script', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
});
