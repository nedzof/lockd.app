import { logger } from '../../../utils/logger.js';

export async function runBinaryTests() {
  logger.info('Running binary data tests...');
  
  // Import and run tests
  const { testBinaryDataHandling } = await import('./test-binary-data-handling.js');
  const { testScannerBinaryData } = await import('./test-scanner-binary-data.js');
  const { testSimpleBinary } = await import('./test-simple-binary.js');
  
  await testBinaryDataHandling();
  await testScannerBinaryData();
  await testSimpleBinary();
  
  logger.info('Binary data tests completed');
} 