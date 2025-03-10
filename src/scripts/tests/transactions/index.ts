import { logger } from '../../../utils/logger.js';

export async function runTransactionTests() {
  logger.info('Running transaction tests...');
  
  // Import and run tests
  const { testTransactionTranslation } = await import('./test-transaction-translation.js');
  const { testTxParser } = await import('./test-tx-parser.js');
  const { testTransactions } = await import('./test-transactions.js');
  
  await testTransactionTranslation();
  await testTxParser();
  await testTransactions();
  
  logger.info('Transaction tests completed');
} 