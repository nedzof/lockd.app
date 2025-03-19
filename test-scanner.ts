/**
 * Test script for scanner with a specific start block
 */

import { scanner } from './src/services/scanner.js';
import logger from './src/services/logger.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Set up shutdown handlers
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT. Shutting down...');
      await scanner.stop();
      await prisma.$disconnect();
      process.exit(0);
    });

    // Start from a recent block to catch up quickly
    const START_BLOCK = 888400; // Use a more recent block
    
    logger.info(`🧪 TEST: Starting scanner from block ${START_BLOCK}`);
    
    // First make sure no other scanner is running
    await scanner.stop().catch(() => {});
    
    // Clear the processed_transaction table
    const deleteCount = await prisma.processed_transaction.deleteMany({
      where: {
        tx_id: {
          not: 'test-tx-768028b5' // Keep our test transaction
        }
      }
    });
    logger.info(`🧹 Cleared ${deleteCount.count} transactions from database`);
    
    // Start the scanner
    await scanner.start(START_BLOCK);
    logger.info('🚀 Test scanner started successfully');
    
    // Keep the process running
    logger.info('Press Ctrl+C to stop the scanner...');
  } catch (error) {
    logger.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main(); 