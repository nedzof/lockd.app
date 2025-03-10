import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';

// Import test runners
import { runBinaryTests } from './binary';
import { runScannerTests } from './scanner';
import { runTransactionTests } from './transactions';
import { runTagTests } from './tags';
import { runVoteTests } from './votes';
import { runDatabaseTests } from './db';

// Binary Data Tests
export * from './binary/test-binary-data-handling';
export * from './binary/test-scanner-binary-data';
export * from './binary/test-simple-binary';

// Scanner Tests
export * from './scanner/test-scanner-with-tx';
export * from './scanner/test-vote-scanner';

// Transaction Tests
export * from './transactions/test-transaction-translation';
export * from './transactions/test-tx-parser';
export * from './transactions/test-transactions';

// Tag Tests
export * from './tags/test-tag-generation';
export * from './tags/test-tag-generation-api';

// Vote Tests
export * from './votes/test-vote-options';

// Database Tests
export * from './db/test-db-connection';

export async function runAllTests() {
  const prisma = new PrismaClient();
  
  try {
    logger.info('Starting test suite...');
    
    // Run tests by category
    await runBinaryTests();
    await runScannerTests();
    await runTransactionTests();
    await runTagTests();
    await runVoteTests();
    await runDatabaseTests();
    
    logger.info('All tests completed successfully');
  } catch (error) {
    logger.error('Test suite failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
} 