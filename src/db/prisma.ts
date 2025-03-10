import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log all queries
prisma.$on('query', (e) => {
  logger.debug('Query: ' + e.query);
});

// Log all errors
prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

// Log all warnings
prisma.$on('warn', (e) => {
  logger.warn('Database warning:', e);
});

// Log all info
prisma.$on('info', (e) => {
  logger.info('Database info:', e);
});

// Handle connection errors
prisma.$connect()
  .then(() => {
    logger.info('Successfully connected to database');
  })
  .catch((error) => {
    logger.error('Failed to connect to database:', error);
  });

export default prisma; 