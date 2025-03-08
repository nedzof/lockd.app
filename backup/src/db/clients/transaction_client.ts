import { ProcessedTransaction, ParsedTransaction } from '../../shared/types.js';
import { logger } from '../../utils/logger.js';
import { BaseDbClient } from './base_client.js';

/**
 * Client for interacting with transaction-related database operations
 */
export class TransactionClient extends BaseDbClient {
    /**
     * Save a transaction to the database
     * @param tx Transaction to save
     * @param retryAttempt Current retry attempt (used internally for recursive retry)
     * @returns Saved transaction
     */
    public async save_transaction(tx: ParsedTransaction, retryAttempt = 0): Promise<ProcessedTransaction> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        // Maximum number of retry attempts
        const MAX_RETRIES = 3;
        // Timeout for the operation in milliseconds
        const OPERATION_TIMEOUT = 5000; // 5 seconds
        
        try {
            logger.debug('Saving transaction', { tx_id: tx.tx_id, retryAttempt });
            
            // Ensure block_height is a valid number
            const safe_block_height = typeof tx.block_height !== 'undefined' && tx.block_height !== null && !isNaN(Number(tx.block_height))
                ? Number(tx.block_height)
                : 0;
            
            // Create transaction data object with proper BigInt conversion for block_time
            const tx_data = {
                tx_id: tx.tx_id,
                type: tx.type || 'unknown',
                block_height: safe_block_height,
                block_time: this.create_block_time_bigint(tx.block_time),
                metadata: tx.metadata || {},
                protocol: tx.protocol || 'MAP'
            };
            
            // Create a promise with timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`DB operation timed out after ${OPERATION_TIMEOUT}ms`));
                }, OPERATION_TIMEOUT);
            });
            
            // Save the transaction with timeout
            const dbOperationPromise = this.with_fresh_client(async (client) => {
                return await client.processed_transaction.upsert({
                    where: { tx_id: tx.tx_id },
                    update: tx_data,
                    create: tx_data
                });
            });
            
            // Race between the DB operation and the timeout
            const saved_tx = await Promise.race([dbOperationPromise, timeoutPromise]);
            
            logger.debug('Transaction saved successfully', { 
                tx_id: saved_tx.tx_id,
                type: saved_tx.type
            });
            
            return saved_tx;
        } catch (error) {
            // Check if we can retry
            if (retryAttempt < MAX_RETRIES) {
                const isTimeout = error instanceof Error && 
                                  (error.message.includes('timed out') || 
                                   error.message.includes('timeout'));
                                   
                if (isTimeout) {
                    logger.warn('DB operation timeout, retrying', {
                        tx_id: tx.tx_id,
                        attempt: retryAttempt + 1,
                        max_retries: MAX_RETRIES
                    });
                    
                    // Exponential backoff: wait longer before each retry
                    const backoffMs = Math.pow(2, retryAttempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    
                    // Retry the operation
                    return this.save_transaction(tx, retryAttempt + 1);
                }
            }
            
            // Log the error and rethrow if retries are exhausted or it's not a timeout
            logger.error('Error saving transaction', {
                tx_id: tx.tx_id,
                retryAttempt,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get a transaction from the database
     * @param tx_id Transaction ID
     * @returns Transaction or null if not found
     */
    public async get_transaction(tx_id: string): Promise<ProcessedTransaction | null> {
        if (!tx_id) {
            throw new Error('Invalid transaction ID');
        }
        
        try {
            logger.debug('Getting transaction', { tx_id });
            
            // Get the transaction
            const tx = await this.with_fresh_client(async (client) => {
                return await client.processed_transaction.findUnique({
                    where: { tx_id }
                });
            });

            if (!tx) {
                logger.debug('Transaction not found', { tx_id });
                return null;
            }
            
            logger.debug('Transaction found', { 
                tx_id: tx.tx_id,
                type: tx.type
            });
            
            return tx;
        } catch (error) {
            logger.error('Error getting transaction', {
                tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async get_current_block_height(): Promise<number | null> {
        try {
            logger.debug('Getting current block height');
            
            // Try to get the latest block height from processed transactions
            const latest_tx = await this.with_fresh_client(async (client) => {
                return await client.processed_transaction.findFirst({
                    orderBy: {
                        block_height: 'desc'
                    },
                    where: {
                        block_height: {
                            gt: 0
                        }
                    }
                });
            });
            
            if (latest_tx?.block_height) {
                logger.debug(`Using latest transaction block height: ${latest_tx.block_height}`);
                return latest_tx.block_height;
            }
            
            // If we still don't have a height, return null
            logger.warn('Could not determine current block height');
            return null;
        } catch (error) {
            logger.error('Error getting current block height', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    
    /**
     * Clean up all processed transactions from the database
     * @returns Promise<void>
     */
    public async cleanup(): Promise<void> {
        try {
            logger.info('Cleaning up all processed transactions');
            
            const deleted = await this.with_fresh_client(async (client) => {
                return await client.processed_transaction.deleteMany({});
            });
            
            logger.info(`Successfully deleted ${deleted.count} processed transactions`);
        } catch (error) {
            logger.error('Error cleaning up processed transactions', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
}
