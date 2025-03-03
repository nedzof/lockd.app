import { LockAction, LockLike, LockMetadata, ParsedTransaction } from '../../shared/types.js';
import { logger } from '../../utils/logger.js';
import { BaseDbClient } from './base_client.js';

/**
 * Client for interacting with lock-related database operations
 */
export class LockClient extends BaseDbClient {
    /**
     * Process a lock action (like/unlike)
     * @param tx Transaction containing lock data
     * @returns Created or updated lock action
     */
    public async process_lock_action(tx: ParsedTransaction): Promise<LockLike | null> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            const metadata = tx.metadata as LockMetadata;
            
            if (!metadata || !metadata.lock_type || !metadata.target_txid) {
                logger.warn('Missing lock metadata', { 
                    tx_id: tx.tx_id,
                    metadata: JSON.stringify(metadata)
                });
                return null;
            }

            const action: LockAction = metadata.action?.toLowerCase() === 'unlike' ? 'unlike' : 'like';
            
            logger.debug('Processing lock action', { 
                tx_id: tx.tx_id,
                target_txid: metadata.target_txid,
                lock_type: metadata.lock_type,
                action
            });
            
            // Prepare lock data
            const lock_data = {
                lock_txid: tx.tx_id,
                target_txid: metadata.target_txid,
                lock_type: metadata.lock_type,
                action,
                block_height: typeof tx.block_height !== 'undefined' && tx.block_height !== null && !isNaN(Number(tx.block_height))
                    ? Number(tx.block_height)
                    : 0,
                block_time: this.create_block_time_bigint(tx.block_time)
            };
            
            // Create the lock action
            const lock = await this.with_fresh_client(async (client) => {
                return await client.lock_like.create({
                    data: lock_data
                });
            });
            
            logger.debug('Lock action processed successfully', { 
                lock_txid: lock.lock_txid,
                action: lock.action
            });
            
            return lock;
        } catch (error) {
            logger.error('Error processing lock action', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get all lock actions for a target
     * @param target_txid Target transaction ID
     * @returns Array of lock actions
     */
    public async get_locks_for_target(target_txid: string): Promise<LockLike[]> {
        if (!target_txid) {
            throw new Error('Invalid target transaction ID');
        }
        
        try {
            logger.debug('Getting locks for target', { target_txid });
            
            // Get the locks
            const locks = await this.with_fresh_client(async (client) => {
                return await client.lock_like.findMany({
                    where: { target_txid },
                    orderBy: { block_height: 'desc' }
                });
            });
            
            logger.debug('Locks found for target', {
                target_txid,
                count: locks.length
            });
            
            return locks;
        } catch (error) {
            logger.error('Error getting locks for target', {
                target_txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    
    /**
     * Clean up all lock entries from the database
     * @returns Promise<void>
     */
    public async cleanup(): Promise<void> {
        try {
            logger.info('Cleaning up all lock entries');
            
            const deleted = await this.with_fresh_client(async (client) => {
                return await client.lock_like.deleteMany({});
            });
            
            logger.info(`Successfully deleted ${deleted.count} lock entries`);
        } catch (error) {
            logger.error('Error cleaning up lock entries', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
}
