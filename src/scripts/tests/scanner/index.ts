import { logger } from '../../../utils/logger.js';

export async function runScannerTests() {
  logger.info('Running scanner tests...');
  
  // Import and run tests
  const { testScannerWithTx } = await import('./test-scanner-with-tx.js');
  const { testVoteScanner } = await import('./test-vote-scanner.js');
  
  await testScannerWithTx();
  await testVoteScanner();
  
  logger.info('Scanner tests completed');
} 