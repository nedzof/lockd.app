/**
 * Database Connection
 * 
 * Manages the database connection using Prisma.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';

// Initialize logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console()
  ]
});

// Create a singleton Prisma client
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

// Log Prisma events
prisma.$on('query', (e) => {
  logger.debug('Prisma query', {
    query: e.query,
    params: e.params,
    duration: e.duration
  });
});

prisma.$on('error', (e) => {
  logger.error('Prisma error', {
    message: e.message,
    target: e.target
  });
});

prisma.$on('info', (e) => {
  logger.info('Prisma info', {
    message: e.message,
    target: e.target
  });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning', {
    message: e.message,
    target: e.target
  });
});

// Connect to the database
async function connect(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to database');
  } catch (error) {
    logger.error('Error connecting to database', {
      error: (error as Error).message
    });
    throw error;
  }
}

// Disconnect from the database
async function disconnect(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from database');
  } catch (error) {
    logger.error('Error disconnecting from database', {
      error: (error as Error).message
    });
  }
}

export { prisma, connect, disconnect };
