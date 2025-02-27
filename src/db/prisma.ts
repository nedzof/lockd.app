import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  var prisma: PrismaClient | undefined;
}

// Determine if we should use direct connection
const useDirectUrl = process.env.DIRECT_URL && ['findMany', 'create', 'update', 'delete'].some(op => 
  process.env.NODE_ENV === 'production' || process.env.USE_DIRECT_URL === 'true'
);

// Log connection details
logger.info('Initializing Prisma client', {
  useDirectUrl,
  databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set',
  directUrl: process.env.DIRECT_URL ? 'Set' : 'Not set',
  nodeEnv: process.env.NODE_ENV,
});

// Configure Prisma client with proper connection settings
const prisma = global.prisma || new PrismaClient({
  log: [
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
    { level: 'info', emit: 'stdout' },
    { level: 'query', emit: 'stdout' },
  ],
  datasourceUrl: useDirectUrl ? process.env.DIRECT_URL : process.env.DATABASE_URL,
  // Add connection timeout settings
  errorFormat: 'pretty',
});

// Process-level event handler for graceful shutdown
process.on('beforeExit', () => {
  logger.info('Application is shutting down');
});

// Add middleware to handle connection issues
prisma.$use(async (params, next) => {
  const startTime = Date.now();
  const transactionId = Math.random().toString(36).substring(7);

  try {
    logger.debug(`Starting database operation`, {
      model: params.model,
      action: params.action,
      transactionId
    });
    
    // Execute the query
    const result = await next(params);
    
    // Log slow queries
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        model: params.model,
        action: params.action,
        duration: `${duration}ms`,
        transactionId
      });
    }
    
    return result;
  } catch (error: any) {
    logger.error('Prisma query error', {
      model: params.model,
      action: params.action,
      error: error.message,
      code: error.code,
      transactionId
    });
    
    throw error;
  }
});

// Initial connection setup
prisma.$connect().catch(e => {
  logger.error('Failed to connect to database', {
    error: e instanceof Error ? e.message : 'Unknown error'
  });
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export { prisma };
export default prisma;
