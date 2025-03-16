import { prisma } from '../db/prisma.js';
import { PrismaClient } from '@prisma/client';
import type { Post } from '@prisma/client';
import { ParsedTransaction, DbError, PostWithvote_options, ProcessedTxMetadata, ProcessedTransaction } from '../shared/types.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class DbClient {
    private static instance: DbClient | null = null;
    private instance_id: number;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    private constructor() {
        this.instance_id = Date.now();
        
        // Enhanced initialization logging
        logger.info(`DbClient initialization`, { 
            instance_id: this.instance_id,
            db_url: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@').split('?')[0],
            using_pg_bouncer: process.env.DATABASE_URL?.includes('pgbouncer=true'),
            connection_pooling: process.env.DATABASE_URL?.includes('connection_limit'),
            pool_timeout: process.env.DATABASE_URL?.includes('pool_timeout')
        });

        // Set up Prisma error logging with enhanced details
        (prisma as any).$on('error', (e: { message: string; target?: string }) => {
            logger.error('Prisma client error', {
                instance_id: this.instance_id,
                error: e.message,
                target: e.target,
                timestamp: new Date().toISOString()
            });
        });

        // Add query logging
        (prisma as any).$on('query', (e: { query: string; params: string[]; duration: number }) => {
            logger.debug('Prisma query executed', {
                instance_id: this.instance_id,
                duration: e.duration,
                param_count: e.params.length,
                query_preview: e.query.substring(0, 100)
            });
        });
    }

    public static get_instance(): DbClient {
        if (!DbClient.instance) {
            DbClient.instance = new DbClient();
            logger.info('Created new DbClient singleton instance');
        } else {
            logger.debug('Reusing existing DbClient instance');
        }
        return DbClient.instance;
    }

    /**
     * Executes a database operation with a fresh Prisma client
     * Handles connection errors and retries if necessary
     */
    private async with_fresh_client<T>(
        operation: (client: PrismaClient) => Promise<T>,
        retries = this.MAX_RETRIES,
        delay = this.RETRY_DELAY
    ): Promise<T> {
        let last_error: Error | null = null;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Create a fresh client for each operation
                const client = new PrismaClient({
                    datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
                    log: [
                        { level: 'error', emit: 'stdout' },
                        { level: 'warn', emit: 'stdout' },
                    ],
                });
                
                try {
                    // Execute the operation
                    const result = await operation(client);
                    return result;
                } finally {
                    // Always disconnect the client when done
                    await client.$disconnect().catch(err => {
                        logger.warn('DB: ERROR DISCONNECTING CLIENT', {
                            error: err instanceof Error ? err.message : 'Unknown error',
                            attempt
                        });
                    });
                }
            } catch (error) {
                last_error = error instanceof Error ? error : new Error('Unknown database error');
                
                // Check if this is a retryable error
                const is_retryable = this.is_retryable_error(error);
                
                if (attempt < retries && is_retryable) {
                    const wait_time = delay * attempt; // Exponential backoff
                    
                    logger.warn(`DB: OPERATION FAILED, RETRYING (${attempt}/${retries})`, {
                        error: last_error.message,
                        retryable: is_retryable,
                        wait_time: `${wait_time}ms`
                    });
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, wait_time));
                } else if (!is_retryable) {
                    // If error is not retryable, break immediately
                    logger.error('DB: NON-RETRYABLE ERROR', {
                        error: last_error.message,
                        attempt
                    });
                    break;
                }
            }
        }
        
        // If we got here, all retries failed
        logger.error('DB: ALL RETRIES FAILED', {
            error: last_error?.message || 'Unknown error',
            retries
        });
        
        throw last_error || new Error('Database operation failed after multiple retries');
    }

    /**
     * Process a transaction and create or update associated posts
     * @param tx Transaction to process
     * @returns Created or updated post
     */
    public async process_transaction(tx: ParsedTransaction): Promise<Post> {
        try {
            logger.info('DB: PROCESSING TRANSACTION', {
                tx_id: tx.tx_id,
                type: tx.type,
                block_height: tx.block_height,
                author_address: tx.author_address,
                metadata: JSON.stringify(tx.metadata).substring(0, 500) // Limit string length
            });
            
            // Convert BigInt values to numbers
            const safe_block_height = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // First, save the transaction to the ProcessedTransaction table
            await this.save_transaction(tx);
            
            // Prepare post data
            const post_data = {
                tx_id: tx.tx_id,
                content: tx.metadata?.content || '',
                author_address: tx.metadata?.author_address || tx.author_address,
                created_at: tx.block_time ? new Date(tx.block_time) : new Date(),
                tags: tx.metadata?.tags || [],
                is_vote: tx.type === 'vote',
                is_locked: !!tx.metadata?.lock_amount && tx.metadata.lock_amount > 0,
                metadata: tx.metadata
            };
            
            logger.debug('Prepared post data', {
                tx_id: tx.tx_id,
                post_data_keys: Object.keys(post_data),
                author_address: post_data.author_address,
                is_vote: post_data.is_vote,
                is_locked: post_data.is_locked,
                has_metadata: !!post_data.metadata
            });
            
            // Check for image data
            let image_buffer: Buffer | null = null;
            if (tx.metadata?.image_metadata?.is_image && tx.metadata?.raw_image_data) {
                try {
                    // Convert image data to buffer based on format
                    if (typeof tx.metadata.raw_image_data === 'string') {
                        if (tx.metadata.raw_image_data.startsWith('data:')) {
                            // Handle data URI
                            const base64_data = tx.metadata.raw_image_data.split(',')[1];
                            image_buffer = Buffer.from(base64_data, 'base64');
                        } else {
                            // Assume base64 string
                            image_buffer = Buffer.from(tx.metadata.raw_image_data, 'base64');
                        }
                    } else if (Buffer.isBuffer(tx.metadata.raw_image_data)) {
                        // Already a buffer
                        image_buffer = tx.metadata.raw_image_data;
                    }
                    
                    logger.debug('Processed image data', {
                        tx_id: tx.tx_id,
                        has_image_buffer: !!image_buffer,
                        buffer_size: image_buffer?.length
                    });
                } catch (error) {
                    logger.error('Error processing image data', {
                        tx_id: tx.tx_id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            
            // Create or update the post
            const post = await this.with_fresh_client(async (client) => {
                // Check if post already exists
                const existing_post = await client.post.findUnique({
                    where: { tx_id: tx.tx_id }
                });
                
                if (existing_post) {
                    logger.info('Post already exists, updating', { tx_id: tx.tx_id });
                    
                    // Update the post
                    return await client.post.update({
                        where: { tx_id: tx.tx_id },
                        data: {
                            content: post_data.content,
                            tags: post_data.tags,
                            is_vote: post_data.is_vote,
                            is_locked: post_data.is_locked,
                            metadata: post_data.metadata,
                            ...(image_buffer ? {
                                raw_image_data: image_buffer,
                                media_type: tx.metadata?.image_metadata?.content_type || 'image/jpeg'
                            } : {})
                        }
                    });
                } else {
                    logger.info('Creating new post', { tx_id: tx.tx_id });
                    
                    // Create a new post
                    return await client.post.create({
                        data: {
                            tx_id: tx.tx_id,
                            content: post_data.content,
                            author_address: post_data.author_address,
                            created_at: post_data.created_at,
                            tags: post_data.tags,
                            is_vote: post_data.is_vote,
                            is_locked: post_data.is_locked,
                            block_height: safe_block_height,
                            metadata: post_data.metadata,
                            ...(image_buffer ? {
                                raw_image_data: image_buffer,
                                media_type: tx.metadata?.image_metadata?.content_type || 'image/jpeg'
                            } : {})
                        }
                    });
                }
            });
            
            // If this is a vote post, create vote options
            if (post_data.is_vote && tx.metadata?.vote_options && Array.isArray(tx.metadata.vote_options)) {
                const vote_options = tx.metadata.vote_options;
                
                logger.debug('Processing vote options', {
                    tx_id: tx.tx_id,
                    options_count: vote_options.length
                });
                
                // Create each vote option
                for (let i = 0; i < vote_options.length; i++) {
                    const option = vote_options[i];
                    
                    await this.with_fresh_client(async (client) => {
                        // Check if option already exists
                        const existing_option = await client.vote_option.findFirst({
                            where: {
                                post_id: post.id,
                                option_index: i
                            }
                        });
                        
                        if (existing_option) {
                            logger.debug('Vote option already exists, updating', {
                                tx_id: tx.tx_id,
                                option_index: i
                            });
                            
                            // Update the option
                            await client.vote_option.update({
                                where: { id: existing_option.id },
                                data: {
                                    content: option
                                }
                            });
                        } else {
                            logger.debug('Creating new vote option', {
                                tx_id: tx.tx_id,
                                option_index: i
                            });
                            
                            // Create a new option
                            await client.vote_option.create({
                                data: {
                                    tx_id: `${tx.tx_id}_option_${i}`,
                                    content: option,
                                    author_address: post_data.author_address,
                                    post_id: post.id,
                                    option_index: i,
                                    tags: []
                                }
                            });
                        }
                    });
                }
            }
            
            logger.info('Transaction processed successfully', {
                tx_id: tx.tx_id,
                post_id: post.id,
                is_vote: post_data.is_vote,
                is_locked: post_data.is_locked
            });
            
            return post;
        } catch (error) {
            logger.error('Error processing transaction', {
                tx_id: tx?.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Save a transaction to the database
     * @param tx Transaction to save
     * @returns Saved transaction
     */
    public async save_transaction(tx: ParsedTransaction): Promise<ProcessedTransaction> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            logger.debug('Saving transaction', { tx_id: tx.tx_id });
            
            // Ensure block_height is a valid number
            const safe_block_height = tx.block_height && !isNaN(tx.block_height) 
                ? tx.block_height 
                : 0;
            
            // Create transaction data object
            const tx_data = {
                tx_id: tx.tx_id,
                type: tx.type || 'unknown',
                block_height: safe_block_height,
                block_time: this.create_block_time_date(tx.block_time),
                metadata: tx.metadata || {}
            };
            
            // Save the transaction
            const saved_tx = await this.with_fresh_client(async (client) => {
                return await client.processed_transaction.upsert({
                    where: { tx_id: tx.tx_id },
                    update: tx_data,
                    create: tx_data
                });
            });
            
            logger.debug('Transaction saved successfully', { 
                tx_id: saved_tx.tx_id,
                type: saved_tx.type
            });
            
            return saved_tx;
        } catch (error) {
            logger.error('Error saving transaction', {
                tx_id: tx.tx_id,
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
     * Connect to the database
     * @returns True if connection successful, false otherwise
     */
    async connect(): Promise<boolean> {
        logger.info(`Connecting to database`, { instance_id: this.instance_id });
        try {
            await prisma.$connect();
            logger.info(`Successfully connected to database`, { instance_id: this.instance_id });
            return true;
        } catch (error) {
            logger.error(`Failed to connect to database`, {
                instance_id: this.instance_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Disconnect from the database
     */
    async disconnect(): Promise<void> {
        logger.info(`Disconnecting from database`, { instance_id: this.instance_id });
        try {
            await prisma.$disconnect();
            logger.info(`Successfully disconnected from database`, { instance_id: this.instance_id });
        } catch (error) {
            logger.error(`Error disconnecting from database`, {
                instance_id: this.instance_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Check if database connection is active
     * @returns True if connected, false otherwise
     */
    async is_connected(): Promise<boolean> {
        logger.debug(`Checking database connection`, { instance_id: this.instance_id });
        try {
            await prisma.$queryRaw`SELECT 1`;
            logger.debug(`Database connection is active`, { instance_id: this.instance_id });
            return true;
        } catch (error) {
            logger.warn(`Database connection is inactive`, {
                instance_id: this.instance_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Determines if an error is retryable
     * @param error Error to check
     * @returns True if error is retryable, false otherwise
     */
    private is_retryable_error(error: unknown): boolean {
        const db_error = error as DbError;
        // Retry on connection errors or deadlocks
        return db_error.code === '40001' || // serialization failure
               db_error.code === '40P01' || // deadlock
               db_error.code === '57P01';   // connection lost
    }

    /**
     * Creates a BigInt from a block time value
     * Handles different formats of block_time (number, BigInt, string)
     * @param block_time Block time in seconds (Unix timestamp)
     * @returns BigInt
     */
    private create_block_time_date(block_time?: number | BigInt | string | null): BigInt {
        try {
            // Handle undefined, null, or invalid input
            if (block_time === undefined || block_time === null) {
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Convert various input types to number
            let block_time_number: number;
            
            if (typeof block_time === 'bigint') {
                return block_time; // Already a BigInt, return as is
            } else if (typeof block_time === 'string') {
                // Check if it's an ISO date string
                if (block_time.includes('T') && block_time.includes('Z')) {
                    const date = new Date(block_time);
                    return BigInt(Math.floor(date.getTime() / 1000));
                }
                block_time_number = parseInt(block_time, 10);
            } else if (typeof block_time === 'number') {
                block_time_number = block_time;
            } else {
                logger.warn('DB: INVALID BLOCK TIME TYPE', { 
                    block_time,
                    type: typeof block_time,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Check if the conversion resulted in a valid number
            if (isNaN(block_time_number)) {
                logger.warn('DB: BLOCK TIME IS NaN', { 
                    block_time,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Validate the timestamp is reasonable (between 2009 and 100 years in the future)
            const min_timestamp = new Date('2009-01-03').getTime() / 1000; // Bitcoin genesis block
            const max_timestamp = Date.now() / 1000 + (100 * 365 * 24 * 60 * 60); // 100 years in the future
            
            if (block_time_number < min_timestamp || block_time_number > max_timestamp) {
                logger.warn('DB: INVALID BLOCK TIME RANGE', { 
                    block_time: block_time_number,
                    min_timestamp,
                    max_timestamp,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            return BigInt(block_time_number);
        } catch (error) {
            logger.error('DB: ERROR CREATING BLOCK TIME DATE', {
                block_time,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return BigInt(Math.floor(Date.now() / 1000));
        }
    }

    /**
     * Process a batch of transactions
     * @param tx Single transaction or array of transactions to process
     */
    async process_transactions(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                tx_ids: transactions.map(t => t.tx_id)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.process_transaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.process_transaction(t)));
            }
        } catch (error) {
            logger.error('Error in process_transactions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Get a post with its vote options and lock likes
     * @param post_id Post ID
     * @returns Post with vote options and lock likes, or null if not found
     */
    async get_post_with_vote_options(post_id: string): Promise<PostWithvote_options | null> {
        try {
            logger.debug('Getting post with vote options', { post_id });
            
            const post = await prisma.post.findUnique({
                where: { id: post_id },
                include: {
                    vote_options: true,
                    lock_likes: true
                }
            });

            if (!post) {
                logger.debug('Post not found', { post_id });
                return null;
            }

            // Transform the Prisma Post into our custom PostWithvote_options type
            const result: PostWithvote_options = {
                id: post.id,
                post_id: post.id,
                type: post.is_vote ? 'vote' : 'post',
                content: post.content,
                block_time: post.created_at,
                sequence: 0, // Default value
                parent_sequence: 0, // Default value
                created_at: post.created_at,
                updated_at: post.created_at, // Using created_at as updated_at
                protocol: 'MAP', // Default protocol
                sender_address: post.author_address,
                block_height: post.block_height,
                tx_id: post.tx_id,
                image: post.raw_image_data,
                lock_likes: post.lock_likes.map(like => ({
                    id: like.id,
                    tx_id: like.tx_id,
                    lock_amount: like.amount,
                    lock_duration: 0, // Default value
                    created_at: like.created_at,
                    updated_at: like.created_at, // Using created_at as updated_at
                    post_id: like.post_id
                })),
                vote_options: post.vote_options.map(option => ({
                    id: option.id,
                    post_id: option.post_id,
                    content: option.content,
                    index: option.option_index,
                    created_at: option.created_at,
                    updated_at: option.created_at, // Using created_at as updated_at
                    question_id: option.id // Using option.id as question_id
                })),
                vote_question: null // We don't have a voteQuestion model in Prisma
            };
            
            logger.debug('Post retrieved successfully', { 
                post_id, 
                has_vote_options: result.vote_options.length > 0,
                has_lock_likes: result.lock_likes.length > 0
            });
            
            return result;
        } catch (error) {
            logger.error('Error getting post with vote options', {
                post_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Clean up test data from the database
     * Only available in test environment
     */
    async cleanup_test_data(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        
        try {
            logger.info('Cleaning up test data');
            
            await this.with_fresh_client(async (client) => {
                await client.vote_option.deleteMany();
                await client.lock_like.deleteMany();
                await client.post.deleteMany();
                await client.processed_transaction.deleteMany();
            });
            
            logger.info('Test data cleaned up successfully');
        } catch (error) {
            logger.error('Error cleaning up test data', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Verify and document database contents for a transaction
     * Useful for testing and debugging
     * @param tx_id Transaction ID
     * @param test_output_dir Directory to output verification files
     */
    async verify_database_contents(tx_id: string, test_output_dir: string): Promise<void> {
        try {
            logger.info('Verifying database contents', { tx_id });
            
            // Get the processed transaction
            const processed_tx = await this.get_transaction(tx_id);
            if (!processed_tx) {
                throw new Error(`No processed transaction found for tx_id ${tx_id}`);
            }

            const metadata = processed_tx.metadata as ProcessedTxMetadata;

            // Get the post with vote data
            const post = await this.get_post_with_vote_options(metadata.post_id);
            if (!post) {
                throw new Error(`No post found for post_id ${metadata.post_id}`);
            }

            // Prepare verification results
            const results = {
                has_post: true,
                has_image: !!post.image,
                has_vote_question: post.vote_question !== null,
                vote_options_count: post.vote_options?.length || 0,
                has_lock_likes: post.lock_likes?.length > 0 || false,
                tx_id,
                post_id: post.id,
                content_type: post.image ? 'Image + Text' : 'Text Only',
                vote_question: post.vote_question ? {
                    question: post.vote_question.question,
                    total_options: post.vote_question.total_options,
                    options_hash: post.vote_question.options_hash
                } : undefined,
                vote_options: post.vote_options?.map(opt => ({
                    content: opt.content,
                    index: opt.index
                })).sort((a, b) => a.index - b.index)
            };

            // Log verification results
            logger.info('Database verification results', results);

            // Save image if present
            if (post.image) {
                const ext = (metadata.image_metadata?.content_type?.split('/')[1] || 'jpg');
                const image_path = path.join(test_output_dir, `${tx_id}_image.${ext}`);
                await fs.promises.writeFile(image_path, post.image);
                logger.info('Saved image to file', { path: image_path });
            }

            // Write verification results to file
            const output_path = path.join(test_output_dir, `${tx_id}_verification.txt`);
            const output_content = [
                `Transaction ID: ${tx_id}`,
                `Post ID: ${post.id}`,
                `Content Type: ${results.content_type}`,
                `Block Time: ${post.created_at.toISOString()}`,
                `Sender Address: ${post.sender_address || 'Not specified'}`,
                '\nContent:',
                post.content,
                '\nTransaction Details:',
                `- Has Image: ${results.has_image}`,
                `- Has Vote Question: ${results.has_vote_question}`,
                `- Vote Options Count: ${results.vote_options_count}`,
                `- Has Lock Likes: ${results.has_lock_likes}`,
                results.has_image ? [
                    '\nImage Metadata:',
                    `- Content Type: ${metadata.image_metadata?.content_type || 'Not specified'}`,
                    `- Filename: ${metadata.image_metadata?.filename || 'Not specified'}`,
                    `- Size: ${metadata.image_metadata?.size || 'Not specified'}`,
                    `- Dimensions: ${metadata.image_metadata?.width || '?'}x${metadata.image_metadata?.height || '?'}`
                ].join('\n') : '',
                results.has_vote_question ? [
                    '\nVote Details:',
                    `Question: ${post.vote_question?.question}`,
                    `Total Options: ${post.vote_question?.total_options}`,
                    `Options Hash: ${post.vote_question?.options_hash}`,
                    '\nVote Options:',
                    ...post.vote_options
                        .sort((a, b) => a.index - b.index)
                        .map((opt, i) => `${i + 1}. ${opt.content} (Index: ${opt.index})`)
                ].join('\n') : '\nNo Vote Data'
            ].join('\n');

            await fs.promises.writeFile(output_path, output_content);
            logger.info('Saved verification results to file', { path: output_path });
        } catch (error) {
            logger.error('Error verifying database contents', {
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
     * Save image data to database
     * @param params Image parameters including tx_id, image_data, and content_type
     */
    public async save_image(params: {
        tx_id: string;
        image_data: Buffer | string;
        content_type: string;
        filename?: string;
        width?: number;
        height?: number;
        size?: number;
    }): Promise<void> {
        try {
            logger.debug('save_image called with params', {
                tx_id: params.tx_id,
                content_type: params.content_type,
                image_data_type: typeof params.image_data,
                image_size: typeof params.image_data === 'string' ? params.image_data.length : params.image_data?.length,
                has_filename: !!params.filename
            });

            return this.with_fresh_client(async (client) => {
                // Convert image data to buffer based on format
                let image_buffer: Buffer;
                if (typeof params.image_data === 'string') {
                    if (params.image_data.startsWith('data:')) {
                        // Handle data URI
                        const base64_data = params.image_data.split(',')[1];
                        image_buffer = Buffer.from(base64_data, 'base64');
                    } else {
                        // Assume base64 string
                        image_buffer = Buffer.from(params.image_data, 'base64');
                    }
                } else if (Buffer.isBuffer(params.image_data)) {
                    // Already a buffer
                    image_buffer = params.image_data;
                } else {
                    // Fallback
                    image_buffer = Buffer.from(params.image_data);
                }

                // Use upsert instead of update to handle cases where the post doesn't exist yet
                await client.post.upsert({
                    where: { tx_id: params.tx_id },
                    update: {
                        raw_image_data: image_buffer,
                        media_type: params.content_type
                    },
                    create: {
                        tx_id: params.tx_id,
                        content: '',  // Required field, can be updated later
                        author_address: '', // Required field, can be updated later
                        raw_image_data: image_buffer,
                        media_type: params.content_type,
                        created_at: new Date(),
                        block_height: 0,
                        tags: []
                    }
                });

                logger.info('Successfully saved image data', {
                    tx_id: params.tx_id,
                    content_type: params.content_type,
                    size: params.size
                });
            });
        } catch (error) {
            logger.error('Failed to save image data', {
                tx_id: params.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Create a post from transaction data
     * @param tx Transaction data
     * @returns Created post
     */
    public async create_post_from_transaction(tx: ParsedTransaction): Promise<any> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            logger.debug('Creating post from transaction', { tx_id: tx.tx_id });
            
            // Extract metadata
            const metadata = tx.metadata || {};
            
            // Convert BigInt values to numbers
            const safe_block_height = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // Create post with snake_case fields
            const post = await this.with_fresh_client(async (client) => {
                return await client.post.create({
                    data: {
                        tx_id: tx.tx_id,
                        content: metadata.content || '',
                        author_address: tx.author_address || '',
                        created_at: tx.block_time ? new Date(tx.block_time) : new Date(),
                        tags: metadata.tags || [],
                        is_vote: metadata.is_vote === true,
                        is_locked: metadata.is_locked === true,
                        media_type: metadata.media_type || null,
                        media_url: metadata.media_url || null,
                        raw_image_data: metadata.raw_image_data || null,
                        block_height: safe_block_height,
                        metadata: metadata
                    }
                });
            });
            
            // If this is a vote post, create vote options
            if (metadata.is_vote && Array.isArray(metadata.vote_options)) {
                const vote_options = metadata.vote_options;
                
                logger.debug('Creating vote options', {
                    tx_id: tx.tx_id,
                    options_count: vote_options.length
                });
                
                // Create each vote option
                for (let i = 0; i < vote_options.length; i++) {
                    const option = vote_options[i];
                    
                    await this.with_fresh_client(async (client) => {
                        await client.vote_option.create({
                            data: {
                                tx_id: `${tx.tx_id}_option_${i}`,
                                content: option,
                                author_address: tx.author_address || '',
                                post_id: post.id,
                                option_index: i,
                                tags: []
                            }
                        });
                    });
                }
            }
            
            logger.info('Post created successfully', {
                tx_id: tx.tx_id,
                post_id: post.id,
                is_vote: metadata.is_vote === true
            });
            
            return post;
        } catch (error) {
            logger.error('Error creating post from transaction', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Split an array into chunks
     * @param arr Array to split
     * @param size Chunk size
     * @returns Array of chunks
     */
    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }
}