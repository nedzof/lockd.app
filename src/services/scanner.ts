/**
 * Scanner Service
 * 
 * Handles scanning blockchain for transactions with the configured header
 */

import { CONFIG } from './config.js';
import logger from './logger.js';
import { junglebus_service } from './junglebus_service.js';
import { tx_parser } from './tx/tx_parser.js';
import { tx_repository } from './db/tx_repository.js';
import { post_repository } from './db/post_repository.js';
import prisma from '../db.js';
import type { TransactionOutput } from './tx/tx_parser.js';
import type { LockProtocolData } from '../shared/types.js';

export class Scanner {
  private isRunning: boolean = false;
  private isWaiting: boolean = false;
  
  /**
   * Logs formatted transaction output information via Winston logger
   * @param output Transaction output object
   * @param index Output index
   */
  private log_output_data(output: TransactionOutput, index: number): void {
    if (!output.isValid) {
      return; // Skip invalid outputs entirely
    }
    
    // Basic output data
    const logData: Record<string, any> = {
      output_index: index + 1
    };
    
    // Check for vote-related content
    const isVoteQuestion = output.metadata?.is_vote === true && 
                          (output.metadata?.total_options || index === 0);
    const isVoteOption = output.metadata?.is_vote === true && 
                         index > 0 && 
                         !isVoteQuestion;
    
    // Extract content to log
    const contentToLog = output.content || '';
    
    // Add content to log data based on its type
    if (contentToLog) {
      if (isVoteQuestion) {
        logData.vote_question = contentToLog;
      } 
      else if (isVoteOption) {
        logData.vote_option = contentToLog;
        logData.option_index = index + 1;
      }
      else {
        logData.content = contentToLog;
      }
    }
    
    // Add important metadata fields
    if (output.metadata) {
      // Only include specific properties from metadata that we care about
      const propertiesToInclude: (keyof LockProtocolData)[] = [
        'is_vote', 'post_id', 'options_hash', 
        'total_options', 'lock_amount', 'lock_duration',
        'content_type', 'tags'
      ];
      
      propertiesToInclude.forEach(key => {
        if (output.metadata && output.metadata[key] !== undefined && output.metadata[key] !== null) {
          logData[key] = output.metadata[key];
        }
      });
    }
    
    // Log at appropriate level
    if (isVoteQuestion) {
      logger.info(`Vote question in output ${index + 1}`, logData);
    } else if (isVoteOption) {
      logger.info(`Vote option in output ${index + 1}`, logData);
    } else {
      logger.info(`Found valid output ${index + 1}`, logData);
    }
  }
  
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
        // Process transactions
        async (tx: any) => {
          try {
            const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
            
            if (!txId) {
              logger.warn(`Received transaction with no ID, skipping`);
              return;
            }
            
            await this.process_transaction(txId);
          } catch (error: any) {
            logger.error(`Error processing transaction: ${error.message}`);
          }
        },
        // Process status updates
        async (status: any) => {
          // Skip verbose logging
          if (status.statusCode === 200 && status.transactions === 0) return;
          if (status.statusCode === 199) return;
          
          // Log important status updates
          if (status.statusCode === 300) {
            logger.warn(`Blockchain reorg detected at block ${status.block}`);
          } else if (status.statusCode === 400) {
            logger.error(`Error processing block ${status.block}: ${status.error || 'Unknown error'}`);
          } else if (status.statusCode === 100 && status.status === 'waiting') {
            if (!this.isWaiting) {
              logger.info('Scanner caught up with blockchain, waiting for new blocks');
              this.isWaiting = true;
            }
          } else if (status.statusCode === 200 && status.transactions > 0) {
            logger.info(`Block ${status.block} processed with ${status.transactions} transactions`);
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
   * Process a single transaction by ID
   * @param txId Transaction ID to process
   */
  async process_transaction(txId: string): Promise<void> {
    try {
      // Check if the transaction is already saved
      const isAlreadySaved = await tx_repository.isTransactionSaved(txId);
      if (isAlreadySaved) {
        logger.debug(`Transaction ${txId} already saved, skipping`);
        return;
      }
      
      // Fetch and parse the transaction
      const parsedTx = await tx_parser.parse_transaction(txId);
      
      if (!parsedTx || !parsedTx.outputs || parsedTx.outputs.length === 0) {
        return; // Skip logging for invalid transactions
      }
      
      // Get valid outputs that contain lockd.app data
      const validOutputs = parsedTx.outputs.filter(output => output.isValid);
      const lockdOutputs = validOutputs.filter(output => 
        output.type === 'lockd'
      );

      // Only process if there are lockd.app related outputs
      if (lockdOutputs.length === 0) {
        return;
      }
      
      // Save the transaction to the database
      await tx_repository.saveProcessedTransaction(parsedTx);
      
      // Process the transaction to create a post
      try {
        // Fetch the saved transaction from the database to get the processed metadata
        const savedTx = await prisma.processed_transaction.findUnique({
          where: { tx_id: txId }
        });
        
        if (savedTx) {
          // Create a post from the processed transaction
          await post_repository.processTransaction(savedTx);
        }
      } catch (postError) {
        logger.error(`Error creating post for transaction ${txId}: ${(postError as Error).message}`);
      }

      // Log transaction information
      const txInfo: Record<string, any> = {
        tx_id: txId,
        outputs_count: lockdOutputs.length
      };
      
      if (parsedTx.timestamp) {
        txInfo.timestamp = parsedTx.timestamp;
      }
      
      if (parsedTx.blockHeight) {
        txInfo.block_height = parsedTx.blockHeight;
      }
      
      // Determine if this is a vote transaction
      const isVote = lockdOutputs.some(output => output.metadata?.is_vote === true);
      txInfo.transaction_type = isVote ? 'vote' : 'post';
      
      logger.info(`Lockd transaction found in block ${parsedTx.blockHeight || 'unconfirmed'}`, txInfo);
      
      // Log details about each output
      lockdOutputs.forEach((output, index) => {
        this.log_output_data(output, index);
      });
    } catch (error) {
      logger.error(`Error processing transaction ${txId}: ${(error as Error).message}`);
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
      logger.info('Scanner stopped successfully');
    } catch (error) {
      logger.error(`Failed to stop scanner: ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const scanner = new Scanner();