import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma client with proper connection settings
const prisma = global.prisma || new PrismaClient({
  log: [
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
    { level: 'info', emit: 'stdout' },
    { level: 'query', emit: 'stdout' },
  ],
  datasourceUrl: process.env.DATABASE_URL,
});

// Add middleware to handle connection issues
prisma.$use(async (params, next) => {
  const startTime = Date.now();
  try {
    const result = await next(params);
    const duration = Date.now() - startTime;
    
    // Log slow queries (over 1 second)
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        model: params.model,
        action: params.action,
        duration: `${duration}ms`
      });
    }
    return result;
  } catch (error: any) {
    // Log query errors with detailed information
    logger.error('Prisma query error', {
      model: params.model,
      action: params.action,
      error: error.message,
      code: error.code
    });
    
    // Handle specific prepared statement errors
    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      logger.info('Attempting to recover from prepared statement error');
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        return await next(params);
      } catch (retryError) {
        logger.error('Failed to recover from prepared statement error', {
          error: retryError
        });
        throw retryError;
      }
    }
    throw error;
  }
});

// Handle development mode and hot reloading
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Handle cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
