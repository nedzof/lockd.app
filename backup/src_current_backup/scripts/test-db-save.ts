/**
 * Test DB Save Script
 * 
 * Tests saving a processed transaction to the database
 */

import { tx_parser } from '../services/tx_parser.js';
import { tx_repository } from '../services/db/tx_repository.js';
import logger from '../services/logger.js';
import prisma from '../db.js';

// Example transaction IDs to test with
const TEST_TRANSACTION_IDS = [
  'c8ebe9050fdb87a546c0477b024d70727e07c9088ad11065fac5fb227b5a72f8', // Vote transaction
  'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053', // Transaction with an image and invalid date
];

/**
 * Delete existing test entries to start fresh
 */
async function deleteExistingEntries(): Promise<void> {
  try {
    logger.info('Deleting existing test entries from database');
    
    for (const txId of TEST_TRANSACTION_IDS) {
      await prisma.processed_transaction.deleteMany({
        where: {
          tx_id: txId
        }
      });
      logger.info(`Deleted transaction ${txId} from database (if it existed)`);
    }
  } catch (error) {
    logger.error(`Error deleting existing entries: ${(error as Error).message}`);
  }
}

/**
 * Test saving transactions to the database
 */
async function testDbSave(): Promise<void> {
  try {
    logger.info('Starting database save test');
    
    // First, delete existing entries
    await deleteExistingEntries();
    
    for (const txId of TEST_TRANSACTION_IDS) {
      logger.info(`Processing transaction ${txId}`);
      
      // Parse the transaction
      const parsedTx = await tx_parser.parse_transaction(txId);
      
      // Save to database
      await tx_repository.saveProcessedTransaction(parsedTx);
      
      logger.info(`Transaction ${txId} saved to database`);
    }
    
    logger.info('Test completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Test failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run the test
testDbSave().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 