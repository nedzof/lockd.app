import { logger } from '../../../utils/logger.js';

export async function runVoteTests() {
  logger.info('Running vote tests...');
  
  // Import and run tests
  const { testVoteOptions } = await import('./test-vote-options.js');
  
  await testVoteOptions();
  
  logger.info('Vote tests completed');
} 