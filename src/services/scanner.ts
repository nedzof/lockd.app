/**
 * Scanner Service
 * 
 * Handles scanning blockchain for lockd.app transactions
 */

import { ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { CONFIG } from './config.js';
import logger from './logger.js';
import { junglebus_service } from './junglebus_service.js';
import { tx_parser } from './tx/tx_parser.js';
import { tx_repository } from './db/tx_repository.js';
import { post_repository } from './db/post_repository.js';
import prisma from '../db.js';

export class Scanner {
  private isRunning: boolean = false;
  
  constructor() {
    logger.info('🚀 Scanner initialized');
  }
  
  /**
   * Start scanning from the specified block height
   */
  async start(fromBlock?: number): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Scanner is already running');
      return;
    }
    
    const startBlock = fromBlock ?? CONFIG.DEFAULT_START_BLOCK;
    this.isRunning = true;
    
    logger.info(`🏁 Starting scanner from block ${startBlock}`);
    
    try {
      await junglebus_service.subscribe(
        startBlock,
        this.handleTransaction.bind(this),
        this.handleStatus.bind(this),
        async (error: any, txId?: string) => {
          const errorMessage = error?.message || error?.error || 'Unknown error';
          
          if (txId) {
            logger.error(`❌ Error processing transaction ${txId}: ${errorMessage}`);
          } else {
            logger.error(`❌ Scanner error: ${errorMessage}`);
          }
        }
      );
      
      logger.info('🔔 Scanner subscription established');
    } catch (error) {
      this.isRunning = false;
      logger.error(`❌ Failed to start scanner: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Handle incoming transactions from JungleBus
   */
  private async handleTransaction(tx: any): Promise<void> {
    try {
      const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
      
      if (!txId) {
        return; // Skip transactions without ID
      }
      
      // Check if already processed
      const isAlreadySaved = await tx_repository.isTransactionSaved(txId);
      if (isAlreadySaved) {
        return;
      }
      
      // Parse and process the transaction
      const parsedTx = await tx_parser.parse_transaction(txId);
      
      // Skip if no valid outputs or no lockd outputs
      if (!parsedTx?.outputs?.length) return;
      
      const lockdOutputs = parsedTx.outputs.filter(output => output.isValid && output.type === 'lockd');
      if (lockdOutputs.length === 0) return;
      
      // Save the transaction
      await tx_repository.saveProcessedTransaction(parsedTx);
      
      // Create a post from the transaction
      try {
        const savedTx = await prisma.processed_transaction.findUnique({
          where: { tx_id: txId }
        });
        
        if (savedTx) {
          await post_repository.processTransaction(savedTx);
        }
      } catch (error) {
        logger.error(`❌ Error creating post: ${(error as Error).message}`);
      }
      
      // Log transaction information
      const isVote = lockdOutputs.some(output => output.metadata?.is_vote === true);
      
      logger.info(`${isVote ? '📊' : '📝'} ${isVote ? 'Vote' : 'Post'} found in block ${parsedTx.blockHeight || 'unconfirmed'}`, {
        tx_id: txId,
        block_height: parsedTx.blockHeight,
        outputs_count: lockdOutputs.length,
        timestamp: parsedTx.timestamp
      });
    } catch (error) {
      logger.error(`❌ Error processing transaction: ${(error as Error).message}`);
    }
  }
  
  /**
   * Handle status updates from JungleBus
   */
  private async handleStatus(status: any): Promise<void> {
    // Only log meaningful status updates
    if (status.statusCode === ControlMessageStatusCode.BLOCK_DONE && status.transactions > 0) {
      logger.info(`🧱 Block ${status.block} processed with ${status.transactions} transactions`);
    } else if (status.statusCode === ControlMessageStatusCode.WAITING) {
      logger.info('⏳ Waiting for new blocks...');
    } else if (status.statusCode === ControlMessageStatusCode.REORG) {
      logger.warn(`🔄 Blockchain reorg detected at block ${status.block}`);
    } else if (status.statusCode === ControlMessageStatusCode.ERROR) {
      logger.error(`❌ Error processing block ${status.block}: ${status.error || 'Unknown error'}`);
    }
  }
  
  /**
   * Stop the scanner
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('⚠️ Scanner is not running');
      return;
    }
    
    try {
      await junglebus_service.unsubscribe();
      this.isRunning = false;
      logger.info('🛑 Scanner stopped successfully');
    } catch (error) {
      logger.error(`❌ Failed to stop scanner: ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const scanner = new Scanner();