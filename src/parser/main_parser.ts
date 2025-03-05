/**
 * MainParser: Main parser class that orchestrates all the specialized parsers
 */
import { BaseParser } from './base_parser.js';
import { TransactionDataParser } from './transaction_data_parser.js';
import { LockProtocolParser } from './lock_protocol_parser.js';
import { MediaParser } from './media_parser.js';
import { VoteParser } from './vote_parser.js';
import { ParsedTransaction, JungleBusResponse, LockProtocolData } from '../shared/types.js';
import { db_client } from '../db/index.js';
import { logger } from '../utils/logger.js';

export class MainParser extends BaseParser {
    private transaction_data_parser: TransactionDataParser;
    private lock_protocol_parser: LockProtocolParser;
    private media_parser: MediaParser;
    private vote_parser: VoteParser;
    private transactionCache = new Map<string, boolean>();
    private readonly MAX_CACHE_SIZE = 10000;

    constructor() {
        super();
        
        this.transaction_data_parser = new TransactionDataParser();
        this.lock_protocol_parser = new LockProtocolParser();
        this.media_parser = new MediaParser();
        this.vote_parser = new VoteParser();
        
        logger.info('🧩 MainParser initialized');
    }

    /**
     * Parse a single transaction
     * @param tx_id Transaction ID to parse
     */
    public async parse_transaction(tx_id: string): Promise<void> {
        // Check if transaction is already in cache
        if (this.transactionCache.has(tx_id)) {
            logger.info('🔄 Transaction already in cache', { tx_id });
            return; // Assume already processed
        }

        try {
            if (!tx_id || typeof tx_id !== 'string') {
                logger.error('❌ Invalid transaction ID', { tx_id });
                return;
            }

            logger.info('🔍 Parsing transaction', { tx_id });

            // Fetch transaction from JungleBus
            const tx = await this.transaction_data_parser.fetch_transaction(tx_id);
            
            if (!tx || !tx.transaction) {
                logger.warn('⚠️ Transaction not found', { tx_id });
                return;
            }

            // Extract data from transaction
            const data = this.transaction_data_parser.extract_data_from_transaction(tx);

            if (data.length === 0) {
                logger.warn('⚠️ No data in transaction', { tx_id });
                return;
            }

            // Extract Lock protocol data
            const lockData = this.lock_protocol_parser.extract_lock_protocol_data(data, tx);

            if (!lockData) {
                logger.info('⏭️ Not a Lock protocol tx', { tx_id });
                return;
            }

            // Process vote data if applicable
            if (lockData.is_vote) {
                const voteData = this.vote_parser.process_vote_data(data);
                if (voteData.is_vote) {
                    lockData.vote_question = voteData.question;
                    lockData.vote_options = voteData.options;
                    lockData.total_options = voteData.total_options;
                    lockData.options_hash = voteData.options_hash;
                }
            }

            // Create transaction record
            const txRecord: ParsedTransaction = {
                tx_id,
                block_height: tx.block_height || 0,
                block_time: tx.block_time 
                    ? String(tx.block_time) // Keep as string, dbClient will convert to BigInt
                    : String(Math.floor(Date.now() / 1000)),
                author_address: this.transaction_data_parser.get_sender_address(tx),
                metadata: lockData
            };

            // Debug log the transaction record
            logger.debug('💾 Saving transaction', {
                tx_id,
                block_time_type: typeof txRecord.block_time,
                block_time: txRecord.block_time
            });

            // Determine transaction type based on lock data
            txRecord.type = this.determine_transaction_type(lockData);
            txRecord.protocol = 'LOCK'; // Set the protocol explicitly
            
            // Debug log the transaction record
            logger.debug('🏷️ Transaction type', {
                tx_id,
                type: txRecord.type,
                is_vote: lockData.is_vote,
                is_locked: lockData.is_locked
            });
            
            // Save to database using the new db_client.process_transaction method
            try {
                const savePromise = db_client.process_transaction(txRecord);
                const dbTimeoutPromise = new Promise<void>((resolve) => {
                    setTimeout(() => {
                        logger.warn('⏱️ DB operation timeout', { tx_id });
                        resolve();
                    }, 10000); // 10 second timeout
                });
                
                await Promise.race([savePromise, dbTimeoutPromise]);
                logger.info('✅ Transaction saved', { tx_id });
            } catch (dbError) {
                logger.error('❌ Failed to save transaction', {
                    tx_id,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
            }
        } catch (error) {
            logger.error('❌ Failed to parse transaction', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        // Add to cache after processing
        this.transactionCache.set(tx_id, true);
        this.prune_cache(); // Prune cache if needed
    }

    /**
     * Parse multiple transactions in batches
     * @param tx_ids Array of transaction IDs to parse
     */
    public async parse_transactions(tx_ids: string[]): Promise<void> {
        // Process in batches of 10
        const batchSize = 10;
        for (let i = 0; i < tx_ids.length; i += batchSize) {
            const batch = tx_ids.slice(i, i + batchSize);
            await Promise.all(batch.map(tx_id => this.parse_transaction(tx_id)));
        }
    }

    /**
     * Determine the transaction type based on lock data
     * @param lockData The lock protocol data from a transaction
     * @returns The transaction type string
     */
    private determine_transaction_type(lockData: LockProtocolData): string {
        // Determine the type based on the lock protocol data
        if (lockData.is_vote) {
            return 'post'; // Vote posts are still considered posts
        }
        
        if (lockData.is_locked) {
            return 'like'; // Locked content is considered a 'like' action
        }
        
        // Check for image type posts
        if (lockData.image_metadata && lockData.image_metadata.is_image) {
            return 'post'; // Image posts
        }
        
        // Check for reply type
        if (lockData.reply_to) {
            return 'reply';
        }
        
        // Check for repost type
        if (lockData.repost_of) {
            return 'repost';
        }
        
        // Default to standard post type
        return 'post';
    }
    
    /**
     * Prune the transaction cache if it exceeds the maximum size
     */
    private prune_cache(): void {
        if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
            // Convert to array of keys
            const keys = Array.from(this.transactionCache.keys());
            
            // Remove oldest entries (first 20% of the cache)
            const pruneCount = Math.floor(this.MAX_CACHE_SIZE * 0.2);
            const keysToRemove = keys.slice(0, pruneCount);
            
            for (const key of keysToRemove) {
                this.transactionCache.delete(key);
            }
            
            logger.info('🧹 Pruned transaction cache', {
                pruned: pruneCount,
                remaining: this.transactionCache.size
            });
        }
    }
}
