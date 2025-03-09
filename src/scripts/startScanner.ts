/**
 * Start Scanner Script
 * 
 * Entry point for the scanner application
 * Handles starting the Lockd.app blockchain transaction scanner
 */

import { scanner } from '../services/scanner.js';
import logger from '../services/logger.js';
import { CONFIG } from '../services/config.js';

// Check if we're in cleanup mode
const CLEANUP_MODE = process.env.CLEANUP_DB === 'true';

// Get start block from environment or use default from config
const START_BLOCK = process.env.START_BLOCK 
  ? parseInt(process.env.START_BLOCK, 10)
  : undefined; // undefined will make the scanner use the default from config

/**
 * Main function to start the scanner
 */
async function main() {
  try {
    // Log startup information
    logger.info('Starting Lockd App Transaction Scanner', { 
      cleanup_mode: CLEANUP_MODE,
      start_block: START_BLOCK || CONFIG.DEFAULT_START_BLOCK,
      subscription_id: CONFIG.JB_SUBSCRIPTION_ID,
      environment: CONFIG.NODE_ENV
    });

    // Setup cleanup handlers for graceful shutdown
    setupShutdownHandlers();

    // Start the scanner with the configured start block
    await scanner.start(START_BLOCK);
    logger.info('Scanner is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error(`Scanner startup error: ${(error as Error).message}`);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Setup handlers for graceful shutdown
 */
function setupShutdownHandlers() {
  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal. Shutting down...');
    await cleanup();
    process.exit(0);
  });

  // Handle kill command
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal. Shutting down...');
    await cleanup();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
    await cleanup();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason) => {
    logger.error(`Unhandled promise rejection: ${reason}`);
    await cleanup();
    process.exit(1);
  });
}

/**
 * Perform cleanup operations before shutdown
 */
async function cleanup() {
  try {
    await scanner.stop();
    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error(`Cleanup error: ${(error as Error).message}`);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error in main: ${error.message}`, { stack: error.stack });
  process.exit(1);
});
