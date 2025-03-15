/**
 * View Saved Transactions Script
 * 
 * Displays transactions that have been saved to the database
 */

import prisma from '../db.js';
import logger from '../services/logger.js';

// Transaction IDs to check
const TRANSACTION_IDS = [
  'c8ebe9050fdb87a546c0477b024d70727e07c9088ad11065fac5fb227b5a72f8', // Vote transaction
  'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053', // Transaction with invalid date
];

/**
 * View transactions saved in the database
 */
async function viewSavedTransactions(): Promise<void> {
  try {
    logger.info('Checking saved transactions in database');
    
    for (const txId of TRANSACTION_IDS) {
      // Get transaction from database
      const transaction = await prisma.processed_transaction.findUnique({
        where: {
          tx_id: txId
        }
      });
      
      if (!transaction) {
        console.log(`\nTransaction ${txId} not found in database`);
        continue;
      }
      
      console.log(`\n=== TRANSACTION ${txId} ===`);
      console.log(`Type: ${transaction.type}`);
      console.log(`Block Height: ${transaction.block_height}`);
      console.log(`Block Time: ${new Date(Number(transaction.block_time) * 1000).toISOString()}`);
      console.log(`Protocol: ${transaction.protocol}`);
      console.log(`Created: ${transaction.created_at}`);
      console.log(`Updated: ${transaction.updated_at}`);
      
      console.log('\nMETADATA:');
      console.log(JSON.stringify(transaction.metadata, null, 2));
    }
    
    // Count total transactions in database
    const totalCount = await prisma.processed_transaction.count();
    console.log(`\nTotal transactions in database: ${totalCount}`);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`Error viewing transactions: ${(error as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the script
viewSavedTransactions().catch(async (error) => {
  logger.error(`Unhandled error: ${error.message}`);
  await prisma.$disconnect();
  process.exit(1);
}); 