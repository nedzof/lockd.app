import { logger } from '../../../utils/logger.js';

export async function runTagTests() {
  logger.info('Running tag tests...');
  
  // Import and run tests
  const { testTagGeneration } = await import('./test-tag-generation.js');
  const { testTagGenerationAPI } = await import('./test-tag-generation-api.js');
  
  await testTagGeneration();
  await testTagGenerationAPI();
  
  logger.info('Tag tests completed');
} 