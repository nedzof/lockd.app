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
   * Delegates parsing to tx_parser, avoiding duplicate logic
   */
  private async handleTransaction(tx: any): Promise<void> {
    try {
      // Extract transaction ID using robust method
      const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
      
      // Add a debug log for each transaction received
      logger.info(`🔥 DEBUG: Transaction received in handleTransaction: ${txId}`, {
        tx_partial: JSON.stringify(tx).substring(0, 200) + '...'
      });
      
      if (!txId) {
        return; // Skip transactions without ID
      }
      
      // Log basic transaction info for debugging
      logger.debug(`🔍 Received transaction ${txId}`, {
        addresses: tx.addresses,
        contexts: tx.contexts,
        output_types: tx.output_types
      });
      
      // Check if already processed - avoid duplicate work
      const isAlreadySaved = await tx_repository.isTransactionSaved(txId);
      if (isAlreadySaved) {
        logger.debug(`⏭️ Transaction ${txId} already processed, skipping`);
        return;
      }

      // Log before parsing
      logger.info(`🔥 DEBUG: About to parse transaction ${txId}`);

      // Let the parser handle the transaction - clear separation of concerns
      // The parser examines outputs and extracts metadata
      const parsedTx = await tx_parser.parse_transaction_data(tx);
      
      // Log after parsing
      logger.info(`🔥 DEBUG: Finished parsing transaction ${txId}, has outputs: ${!!parsedTx?.outputs?.length}`);
      
      // Skip if no valid outputs
      if (!parsedTx?.outputs?.length) {
        logger.debug(`⏭️ Transaction ${txId} has no valid outputs, skipping`);
        return;
      }
      
      // Filter for lockd.app outputs - our specific app concern
      const lockdOutputs = parsedTx.outputs.filter(output => output.isValid && output.type === 'lockd');
      
      // Log filtering results
      logger.info(`🔥 DEBUG: Transaction ${txId} has ${lockdOutputs.length} lockd outputs out of ${parsedTx.outputs.length} total outputs`);
      
      if (lockdOutputs.length === 0) {
        logger.debug(`⏭️ Transaction ${txId} has no lockd.app outputs, skipping`);
        return;
      }
      
      // Log before saving
      logger.info(`🔥 DEBUG: About to save transaction ${txId} to database`);
      
      // Save the transaction to the database via repository
      await tx_repository.saveProcessedTransaction(parsedTx);
      
      // Log after saving
      logger.info(`🔥 DEBUG: Finished saving transaction ${txId} to database`);
      
      // Process the transaction to create a post
      try {
        const savedTx = await prisma.processed_transaction.findUnique({
          where: { tx_id: txId }
        });
        
        if (savedTx) {
          await post_repository.processTransaction(savedTx);
          logger.debug(`✅ Created post for transaction ${txId}`);
        } else {
          logger.info(`🔥 DEBUG: Failed to find saved transaction ${txId} after saving it!`);
        }
      } catch (error) {
        logger.error(`❌ Error creating post: ${(error as Error).message}`, {
          tx_id: txId,
          error_stack: (error as Error).stack
        });
      }
      
      // Determine transaction type and log appropriate information
      const isVote = lockdOutputs.some(output => output.metadata?.is_vote === true);
      const hasVoteData = !!(lockdOutputs[0]?.metadata as any)?._custom_metadata?.vote_data;
      
      // Create detailed log data for this transaction
      const logData: Record<string, any> = {
        tx_id: txId,
        block_height: parsedTx.blockHeight,
        outputs_count: lockdOutputs.length,
        timestamp: parsedTx.timestamp,
        content_type: lockdOutputs[0]?.metadata?.content_type || 'text',
        author: parsedTx.authorAddress || '(unknown)'
      };
      
      // Add vote-specific information if it's a vote
      if (isVote) {
        logData.is_vote = true;
        logData.question = lockdOutputs[0]?.metadata?.vote_question || '';
        logData.options_count = lockdOutputs[0]?.metadata?.total_options || 0;
        
        // Log detailed vote data for debugging
        logger.debug(`📊 Vote details for ${txId}`, {
          question: logData.question,
          options_count: logData.options_count,
          has_vote_data: hasVoteData
        });
      }
      
      // Log the transaction with appropriate emoji based on type
      logger.info(`${isVote ? '📊' : '📝'} ${isVote ? 'Vote' : 'Post'} found in block ${parsedTx.blockHeight || 'unconfirmed'}`, logData);
      
    } catch (error) {
      // Log detailed error information
      const errorInfo = {
        message: (error as Error).message,
        stack: (error as Error).stack,
        tx_id: tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id || 'unknown'
      };
      
      logger.error(`❌ Error processing transaction:`, errorInfo);
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