import { logger } from '../../../utils/logger.js';

export async function runDatabaseTests() {
  logger.info('Running database tests...');
  
  // Import and run tests
  const { testDbConnection } = await import('./test-db-connection.js');
  
  await testDbConnection();
  
  logger.info('Database tests completed');
} 