/**
 * Script to run the scanner with debug logging
 */
import { config } from 'dotenv';
import { logger } from '../utils/logger.js';
import { Scanner } from '../services/scanner.js';
import { db_client } from '../db/index.js';

// Load environment variables
config();

// List of sample transaction IDs to process
const sampleTransactions = [
  '5e3ed0db0fbe8f0f9bcc47373380d9f5c8e2b55e1841df38c8e89bca75cd9ae0', // Example transaction ID
  'f6c45b60af2e16d347d625cbea6661e4e4964b2ffd64f72d1fe5ec86e54c6c67', // Example transaction ID
  '5ac08b97f3c5b1a8c9c0a3de57c66ae2a79a8be3a7ee56e12848cee69eff0a7e'  // Example transaction ID
];

async function main() {
  logger.info('Starting scanner process to process transactions...');
  
  // Create a new scanner instance
  const scanner = new Scanner();
  
  try {
    // Start the scanner
    logger.info('Starting scanner...');
    
    // Process a batch of example transactions
    for (const txId of sampleTransactions) {
      logger.info(`Processing transaction: ${txId}`);
      await scanner.processTransaction(txId);
    }
    
    // Now check if posts and vote options are being created
    logger.info('Checking database for posts and vote options...');
    await db_client.check_posts();
    await db_client.check_vote_options();
    await db_client.check_transactions_with_block_heights();
    
    logger.info('Scanner process completed successfully');
  } catch (error) {
    logger.error('Error in scanner process', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Execute the main function
main().catch(error => {
  logger.error('Unhandled error in main process', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
