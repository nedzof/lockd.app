/**
 * MainParser: Main orchestration parser that coordinates all specialized parsers
 * 
 * This class serves as the central coordinator for the entire parsing system, with responsibilities to:
 * 1. Orchestrate the workflow between specialized parsers
 * 2. Manage the transaction processing pipeline
 * 3. Determine transaction types and protocols
 * 4. Handle vote transactions via VoteTransactionService
 * 5. Persist processed data to the database
 * 
 * The MainParser implements a clear separation of concerns by delegating specialized
 * parsing tasks to domain-specific parsers while maintaining the overall workflow:
 * - TransactionDataParser: Handles raw transaction data extraction and basic processing
 * - LockProtocolParser: Processes transaction data according to Lock protocol
 * - MediaParser: Handles media content extraction and processing
 * - VoteParser: Specializes in vote transaction detection and processing
 */
import { BaseParser } from './base_parser.js';
import { TransactionDataParser } from './transaction_data_parser.js';
import { LockProtocolParser } from './lock_protocol_parser.js';
import { MediaParser } from './media_parser.js';
import { VoteParser } from './vote_parser.js';
import { ParsedTransaction, JungleBusResponse, LockProtocolData } from '../shared/types.js';
import { db_client } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';
import { VoteTransactionService } from '../services/vote-transaction-service.js';
import { 
    extract_tags, 
    decode_hex_string, 
    extract_key_value_pairs, 
    normalize_key, 
    process_buffer_data,
    is_binary_data 
} from './utils/helpers.js';

export class MainParser extends BaseParser {
    private transaction_data_parser: TransactionDataParser;
    private lock_protocol_parser: LockProtocolParser;
    private media_parser: MediaParser;
    private vote_parser: VoteParser;
    private vote_transaction_service: VoteTransactionService;
    private prisma: PrismaClient;
    // Use the transactionCache from BaseParser
    private readonly MAX_CACHE_SIZE = 10000; // Override the default MAX_CACHE_SIZE from BaseParser

    constructor() {
        super();
        
        this.transaction_data_parser = new TransactionDataParser();
        this.lock_protocol_parser = new LockProtocolParser();
        this.media_parser = new MediaParser();
        this.vote_parser = new VoteParser();
        this.prisma = new PrismaClient();
        this.vote_transaction_service = new VoteTransactionService(this.prisma);
        
        logger.info('🧩 MainParser initialized with VoteTransactionService');
    }

    /**
     * Parse a single transaction
     * 
     * This method drives the complete transaction parsing workflow:
     * 1. Fetches transaction data using TransactionDataParser
     * 2. Extracts data from the transaction
     * 3. Uses LockProtocolParser to identify and extract protocol-specific data
     * 4. For vote transactions, leverages VoteParser and VoteTransactionService
     * 5. Determines transaction type and protocol
     * 6. Persists the processed data to the database
     * 
     * The implementation includes proper error handling, logging, and caching
     * to ensure robust transaction processing.
     * 
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

            // Add the data to the transaction object for the LockProtocolParser
            tx.data = data;
            
            // Extract Lock protocol data
            const lockData = this.lock_protocol_parser.extract_lock_protocol_data(tx);

            if (!lockData) {
                logger.info('⏭️ Not a Lock protocol tx', { tx_id });
                return;
            }

            // Process vote data if applicable
            // This leverages the comprehensive vote transaction processing system
            // described in the memories to handle different transaction formats
            if (lockData.is_vote) {
                // Get basic vote data
                const voteData = this.vote_parser.process_vote_data(data);
                
                // Get rich vote content with metadata
                const voteContent = this.vote_parser.extractVoteContent(data);
                
                if (voteData.is_vote) {
                    // Update lock data with vote information
                    lockData.vote_question = voteData.question;
                    lockData.vote_options = voteData.options;
                    lockData.total_options = voteData.total_options;
                    lockData.options_hash = voteData.options_hash;
                    
                    // Update with any additional metadata from specialized extraction
                    if (voteContent.post_id) {
                        lockData.post_id = voteContent.post_id;
                    }
                    
                    // Try to process as a vote transaction using the VoteTransactionService
                    try {
                        // Format the transaction for the vote service with enhanced metadata
                        const voteTransaction = {
                            id: tx_id,
                            block_height: tx.block_height || 0,
                            block_time: tx.block_time || Math.floor(Date.now() / 1000),
                            data: data,
                            author_address: this.transaction_data_parser.get_sender_address(tx),
                            post_id: voteContent.post_id || '',
                            timestamp: voteContent.timestamp || ''
                        };
                        
                        logger.info('🗳️ Processing vote transaction', { 
                            tx_id, 
                            question: lockData.vote_question,
                            options_count: lockData.vote_options?.length || 0,
                            author: voteTransaction.author_address ? 
                                `${voteTransaction.author_address.substring(0, 10)}...` : 'unknown',
                            timestamp: new Date(voteTransaction.block_time * 1000).toISOString()
                        });
                        
                        // Process the vote transaction
                        const voteResult = await this.vote_transaction_service.processVoteTransaction(voteTransaction);
                        
                        if (voteResult) {
                            logger.info('✅ Vote transaction processed successfully', { 
                                tx_id,
                                post_id: voteResult.post.id,
                                options_count: voteResult.voteOptions.length
                            });
                            
                            // If vote was processed successfully, we can skip the regular processing
                            this.transactionCache.set(tx_id, true);
                            this.prune_cache();
                            return;
                        }
                    } catch (voteError) {
                        logger.error('❌ Error processing vote transaction', {
                            tx_id,
                            error: voteError instanceof Error ? voteError.message : String(voteError)
                        });
                        // Continue with regular processing as fallback
                    }
                }
            }

            // Create transaction record
            const txRecord: ParsedTransaction = {
                tx_id,
                content: lockData.content || '', // Include content from lock data
                content_type: lockData.content_type || 'text/plain', // Include content type
                block_height: tx.block_height || 0,
                block_time: tx.block_time 
                    ? String(tx.block_time) // Keep as string, dbClient will convert to BigInt
                    : String(Math.floor(Date.now() / 1000)),
                author_address: this.transaction_data_parser.get_sender_address(tx),
                metadata: lockData
            };
            
            // Ensure post_txid is set in metadata to facilitate post creation
            if (txRecord.metadata && typeof txRecord.metadata === 'object') {
                if (!txRecord.metadata.post_txid) {
                    txRecord.metadata.post_txid = tx_id;
                }
            }

            // Debug log the transaction record
            logger.debug('💾 Saving transaction', {
                tx_id,
                content_length: txRecord.content?.length || 0,
                has_content: !!txRecord.content,
                block_time_type: typeof txRecord.block_time,
                block_time: txRecord.block_time
            });

            // Determine transaction type based on lock data
            // This classification system handles various transaction types including votes and media
            txRecord.type = this.determine_transaction_type(lockData);
            txRecord.protocol = 'LOCK'; // Set the protocol explicitly for consistency
            
            // Debug log the final transaction classification
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
     * 
     * This method implements a comprehensive classification system that analyzes
     * the transaction data to determine its primary purpose and type. The classification
     * handles various transaction types including:
     * 
     * - Vote transactions (question + options)
     * - Media posts (images, binary content)
     * - Likes/reactions (locked content)
     * - Replies (reference to parent transaction)
     * - Reposts (reference to original content)
     * - Standard posts (text content)
     * 
     * The implementation prioritizes the most specific type when a transaction
     * could fall into multiple categories.
     * 
     * @param lockData The lock protocol data from a transaction
     * @returns The transaction type string for consistent classification
     */
    private determine_transaction_type(lockData: LockProtocolData): string {
        // Log the lock data for debugging purposes
        this.logDebug('Determining transaction type', {
            is_vote: lockData.is_vote,
            is_locked: lockData.is_locked,
            has_image: !!lockData.image_metadata?.is_image,
            has_reply_to: !!lockData.reply_to,
            has_repost_of: !!lockData.repost_of
        });
        
        // Determine the type based on the lock protocol data
        // Use a priority-based system to classify transactions
        
        // First priority: Vote transactions
        if (lockData.is_vote) {
            return 'vote'; // Explicit vote transaction with question and options
        }
        
        // Second priority: Media content
        if (lockData.image || lockData.media_type === 'image' || lockData.image_metadata?.is_image) {
            // Check if the image has accompanying text
            if (lockData.content && lockData.content.length > 20 && !lockData.content.startsWith('hex:')) {
                return 'image_post'; // Post with significant text and image
            }
            return 'media'; // Primarily media content
        }
        
        // Third priority: Interactions with other content
        if (lockData.is_locked) {
            return 'like'; // Locked content is considered a 'like' action
        }
        
        // Fourth priority: Content relationships
        if (lockData.reply_to) {
            return 'reply'; // Explicit reference to parent transaction
        }
        
        if (lockData.repost_of) {
            return 'repost'; // Explicit reference to original content
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
        // Call the common implementation from BaseParser
        super.prune_cache(this.transactionCache, this.MAX_CACHE_SIZE);
    }
}
