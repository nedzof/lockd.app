import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  console.log('Creating new PrismaClient instance');
  
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'info', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  // Log all queries
  client.$on('query', (e) => {
    console.log('Prisma Query:', {
      query: e.query,
      params: e.params,
      duration: e.duration,
      timestamp: e.timestamp,
    });
  });

  // Handle cleanup
  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, async () => {
      console.log('Cleaning up Prisma client...');
      await client.$disconnect();
      process.exit(0);
    });
  });

  return client;
};

// Create a singleton instance
const prisma = global.prisma || createPrismaClient();

// In development, attach to global object for hot reloading
if (process.env.NODE_ENV === 'development') {
  global.prisma = prisma;
}

export { prisma };
