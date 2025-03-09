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
  private isWaiting: boolean = false;
  
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
        // Process transactions - Only log valid transaction IDs
        async (tx: any) => {
          // Extract transaction ID using the common patterns
          const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
          
          // Basic validation to make sure we have a transaction with some inputs and outputs
          const hasInputs = tx?.tx?.in && tx.tx.in.length > 0;
          const hasOutputs = tx?.tx?.out && tx.tx.out.length > 0;
          
          // Only log transactions that pass basic validation
          if (txId && hasInputs && hasOutputs) {
            logger.info(`Valid transaction: ${txId}`, { tx_id: txId });
          }
        },
        // Process status updates
        async (status: any) => {
          // Only log blocks with transactions or important status updates
          if (status.statusCode === 200 && status.transactions > 0) { // Block done with transactions
            logger.info(`Block ${status.block} processed with ${status.transactions} transactions`);
          } else if (status.statusCode === 300) { // Reorg status
            logger.warn(`Blockchain reorg detected at block ${status.block}`);
          } else if (status.statusCode === 400) { // Error status
            logger.error(`Error processing block ${status.block}: ${status.error || 'Unknown error'}`);
          } else if (status.statusCode === 100 && status.status === 'waiting') {
            // Only log once when first transitioning to the waiting state
            if (!this.isWaiting) {
              logger.info('Scanner caught up with blockchain, waiting for new blocks');
              this.isWaiting = true;
            }
          } else if (status.statusCode === 200) {
            // Reset the waiting state when we process any block (with or without transactions)
            this.isWaiting = false;
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
