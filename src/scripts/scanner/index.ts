import { Scanner } from '../../services/scanner.js';
import { logger } from '../../utils/logger.js';

async function main() {
  const scanner = new Scanner();

  try {
    const startBlock = process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : undefined;
    await scanner.start(startBlock);

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT. Shutting down...');
      await scanner.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM. Shutting down...');
      await scanner.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Scanner failed to start', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

// Run the scanner
main().catch(error => {
  logger.error('Unhandled error', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});

export { Scanner }; 