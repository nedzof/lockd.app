/**
 * Scanner Service
 * 
 * Handles scanning blockchain for transactions with the configured header
 */

import { CONFIG } from './config.js';
import logger from './logger.js';
import { junglebus_service } from './junglebus_service.js';
import { tx_parser } from './tx_parser.js';
import { tx_repository } from './db/tx_repository.js';
import type { TransactionOutput } from './tx_parser.js';
import type { LockProtocolData } from '../shared/types.js';
import chalk from 'chalk';

export class Scanner {
  private isRunning: boolean = false;
  private isWaiting: boolean = false;
  
  /**
   * Displays formatted transaction output in a clean, readable way
   * @param output Transaction output object
   * @param index Output index
   */
  private display_formatted_output(output: TransactionOutput, index: number): void {
    if (!output.isValid) {
      return; // Skip invalid outputs entirely
    }
    
    console.log(chalk.cyan(`------- OUTPUT ${index + 1} -------`));
    
    // Check for vote-related content
    const isVoteQuestion = output.metadata?.is_vote === true && 
                          (output.metadata?.total_options || index === 0);
    const isVoteOption = output.metadata?.is_vote === true && 
                         output.metadata?.option_index !== undefined && 
                         !isVoteQuestion;
    
    // Extract content to display
    const contentToDisplay = output.content || '';
    
    // Display content based on its type
    if (contentToDisplay) {
      if (isVoteQuestion) {
        console.log(chalk.magenta('📊 VOTE QUESTION: ') + chalk.white(contentToDisplay));
      } 
      else if (isVoteOption) {
        const optionIndex = output.metadata?.option_index || '?';
        console.log(chalk.magenta(`⚪ OPTION ${optionIndex}: `) + chalk.white(contentToDisplay));
      }
      else {
        console.log(chalk.green('📝 CONTENT: ') + chalk.white(contentToDisplay));
      }
    }
    
    // Display metadata excluding content fields that were already shown
    if (output.metadata && Object.keys(output.metadata).length > 0) {
      // Only show specific properties from metadata that we care about
      const propertiesToShow: (keyof LockProtocolData)[] = [
        'is_vote', 'is_locked', 'post_id', 'options_hash', 
        'total_options', 'lock_amount', 'lock_duration',
        'content_type', 'media_type', 'tags', 'option_index'
      ];
      
      // Filter to only keys that exist in the metadata
      const keysToDisplay = propertiesToShow.filter(key => 
        output.metadata && 
        output.metadata[key] !== undefined && 
        output.metadata[key] !== null
      );
      
      if (keysToDisplay.length > 0) {
        console.log(chalk.yellow('Metadata:'));
        
        keysToDisplay.forEach(key => {
          if (output.metadata) {
            const value = output.metadata[key];
            
            // Format different value types
            let displayValue = '';
            if (typeof value === 'object' && value !== null) {
              displayValue = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
              displayValue = value ? 'true' : 'false';
            } else if (value === null) {
              displayValue = 'null';
            } else {
              displayValue = String(value);
            }
            
            console.log(chalk.yellow(`  ${String(key)}: `) + chalk.white(displayValue));
          }
        });
      }
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
      
      // Display transaction information
      console.log(`\n${chalk.green('='.repeat(50))}`);
      console.log(chalk.green(`📄 TRANSACTION: ${txId}`));
      
      if (parsedTx.timestamp) {
        console.log(chalk.green(`📅 TIMESTAMP: ${parsedTx.timestamp}`));
      }
      
      if (parsedTx.blockHeight) {
        console.log(chalk.green(`🧱 BLOCK: ${parsedTx.blockHeight}`));
      }
      
      // Determine if this is a vote transaction
      const isVote = lockdOutputs.some(output => output.metadata?.is_vote === true);
      if (isVote) {
        console.log(chalk.green(`📊 VOTE TRANSACTION with ${lockdOutputs.length} outputs`));
      } else {
        console.log(chalk.green(`⭐ Contains ${lockdOutputs.length} Lockd.app outputs`));
      }
      
      console.log(chalk.green('='.repeat(50)));
      
      // Display each lockd output
      lockdOutputs.forEach((output, index) => {
        this.display_formatted_output(output, index);
      });
      
      console.log(chalk.green('='.repeat(50)) + '\n');
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
      logger.info('Scanner stopped');
    } catch (error) {
      logger.error(`Failed to stop scanner: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Export singleton instance
export const scanner = new Scanner();
