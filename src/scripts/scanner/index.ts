import { Scanner } from '../../services/scanner.js';
import { logger } from '../../utils/logger.js';
import { PrismaClient } from '@prisma/client';

async function main() {
  const scanner = new Scanner();
  const prisma = new PrismaClient();

  try {
    // Log initial database state
    const initialTxCount = await prisma.processed_transaction.count();
    const initialPostCount = await prisma.post.count();
    const initialVoteOptionCount = await prisma.vote_option.count();

    logger.info('Initial database state:', {
      transactions: initialTxCount,
      posts: initialPostCount,
      vote_options: initialVoteOptionCount
    });

    const startBlock = process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : undefined;
    await scanner.start(startBlock);

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT. Shutting down...');
      
      // Log final database state
      const finalTxCount = await prisma.processed_transaction.count();
      const finalPostCount = await prisma.post.count();
      const finalVoteOptionCount = await prisma.vote_option.count();

      logger.info('Final database state:', {
        transactions: finalTxCount,
        posts: finalPostCount,
        vote_options: finalVoteOptionCount,
        transactions_added: finalTxCount - initialTxCount,
        posts_added: finalPostCount - initialPostCount,
        vote_options_added: finalVoteOptionCount - initialVoteOptionCount
      });

      await scanner.stop();
      await prisma.$disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM. Shutting down...');
      await scanner.stop();
      await prisma.$disconnect();
      process.exit(0);
    });

    // Log stats every 5 minutes
    setInterval(async () => {
      const currentTxCount = await prisma.processed_transaction.count();
      const currentPostCount = await prisma.post.count();
      const currentVoteOptionCount = await prisma.vote_option.count();

      logger.info('Current database state:', {
        transactions: currentTxCount,
        posts: currentPostCount,
        vote_options: currentVoteOptionCount,
        transactions_added: currentTxCount - initialTxCount,
        posts_added: currentPostCount - initialPostCount,
        vote_options_added: currentVoteOptionCount - initialVoteOptionCount
      });
    }, 5 * 60 * 1000); // 5 minutes

  } catch (error) {
    logger.error('Scanner failed to start', {
      error: error instanceof Error ? error.message : String(error)
    });
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the scanner
main().catch(async error => {
  logger.error('Unhandled error', {
    error: error instanceof Error ? error.message : String(error)
  });
  const prisma = new PrismaClient();
  await prisma.$disconnect();
  process.exit(1);
});

export { Scanner }; 