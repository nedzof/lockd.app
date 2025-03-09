/**
 * Scanner Service
 * 
 * Handles scanning blockchain for transactions with the configured header
 */

import { CONFIG } from './config.js';
import logger from './logger.js';
import { junglebus_service } from './junglebus_service.js';

export class Scanner {
  private isRunning: boolean = false;
  
  constructor() {
    logger.info('Scanner initialized');
  }
  
  /**
   * Start the scanner from a specified block height
   * Using the default start block from config if not specified
   */
  async start(fromBlock?: number): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scanner is already running');
      return;
    }
    
    // Use provided block height or default from config
    const startBlock = fromBlock ?? CONFIG.DEFAULT_START_BLOCK;
    
    this.isRunning = true;
    logger.info(`Starting scanner from block ${startBlock}`);
    
    try {
      // Subscribe to junglebus using the configured subscription ID
      await junglebus_service.subscribe(
        startBlock,
        // Process transactions - just log the transaction IDs
        async (tx: any) => {
          const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
          logger.info(`Found transaction: ${txId}`, { tx_id: txId });
        },
        // Process status updates
        async (status: any) => {
          // Only log important status updates to avoid cluttering the logs
          if (status.statusCode === 200) { // Block done status
            logger.info(`Block ${status.block} processed with ${status.transactions} transactions`);
          } else if (status.statusCode === 300) { // Reorg status
            logger.warn(`Blockchain reorg detected at block ${status.block}`);
          }
        },
        // Handle errors
        async (error: Error, txId?: string) => {
          if (txId) {
            logger.error(`Error processing transaction ${txId}: ${error.message}`);
          } else {
            logger.error(`Scanner error: ${error.message}`);
          }
        }
      );
      
      logger.info('Scanner subscription established');
    } catch (error) {
      this.isRunning = false;
      logger.error(`Failed to start scanner: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Stop the scanner
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Scanner is not running');
      return;
    }
    
    try {
      await junglebus_service.unsubscribe();
      this.isRunning = false;
      logger.info('Scanner stopped');
    } catch (error) {
      logger.error(`Failed to stop scanner: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Export singleton instance
export const scanner = new Scanner();
