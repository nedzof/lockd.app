import { prisma } from '../db/prisma.js';
import { PrismaClient } from '@prisma/client';
import type { Post } from '@prisma/client';
import { ParsedTransaction, DbError, PostWithvote_options, ProcessedTxMetadata, ProcessedTransaction } from '../shared/types.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class DbClient {
    private static instance: DbClient | null = null;
    private instanceId: number;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    private constructor() {
        this.instanceId = Date.now();
        
        // Enhanced initialization logging
        logger.info(`DbClient initialization`, { 
            instanceId: this.instanceId,
            dbUrl: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@').split('?')[0],
            usingPgBouncer: process.env.DATABASE_URL?.includes('pgbouncer=true'),
            connectionPooling: process.env.DATABASE_URL?.includes('connection_limit'),
            poolTimeout: process.env.DATABASE_URL?.includes('pool_timeout')
        });

        // Set up Prisma error logging with enhanced details
        (prisma as any).$on('error', (e: { message: string; target?: string }) => {
            logger.error('Prisma client error', {
                instanceId: this.instanceId,
                error: e.message,
                target: e.target,
                timestamp: new Date().toISOString()
            });
        });

        // Add query logging
        (prisma as any).$on('query', (e: { query: string; params: string[]; duration: number }) => {
            logger.debug('Prisma query executed', {
                instanceId: this.instanceId,
                duration: e.duration,
                paramCount: e.params.length,
                queryPreview: e.query.substring(0, 100)
            });
        });
    }

    public static getInstance(): DbClient {
        if (!DbClient.instance) {
            DbClient.instance = new DbClient();
            logger.info('Created new DbClient singleton instance');
        } else {
            logger.info('Reusing existing DbClient instance');
        }
        return DbClient.instance;
    }

    /**
     * Executes a database operation with a fresh Prisma client
     * Handles connection errors and retries if necessary
     */
    private async withFreshClient<T>(
        operation: (client: PrismaClient) => Promise<T>,
        retries = 3,
        delay = 1000
    ): Promise<T> {
        let lastError: Error | null = null;
        
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
                        logger.warn(' DB: ERROR DISCONNECTING CLIENT', {
                            error: err instanceof Error ? err.message : 'Unknown error',
                            attempt
                        });
                    });
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown database error');
                
                // Check if this is a retryable error
                const isRetryable = this.isRetryableError(error);
                
                if (attempt < retries && isRetryable) {
                    const waitTime = delay * attempt; // Exponential backoff
                    
                    logger.warn(` DB: OPERATION FAILED, RETRYING (${attempt}/${retries})`, {
                        error: lastError.message,
                        retryable: isRetryable,
                        waitTime: `${waitTime}ms`
                    });
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else if (!isRetryable) {
                    // If error is not retryable, break immediately
                    logger.error(' DB: NON-RETRYABLE ERROR', {
                        error: lastError.message,
                        attempt
                    });
                    break;
                }
            }
        }
        
        // If we got here, all retries failed
        logger.error(' DB: ALL RETRIES FAILED', {
            error: lastError?.message || 'Unknown error',
            retries
        });
        
        throw lastError || new Error('Database operation failed after multiple retries');
    }

    public async processTransaction(tx: ParsedTransaction): Promise<Post> {
        try {
            logger.info('DB: SAVING TRANSACTION', {
                tx_id: tx.tx_id,
                type: tx.type,
                block_height: tx.block_height,
                author_address: tx.author_address,
                metadata: JSON.stringify(tx.metadata).substring(0, 500) // Limit string length
            });
            
            // Convert BigInt values to numbers
            const safeBlockHeight = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // First, save the transaction to the ProcessedTransaction table
            await this.withFreshClient(async (client) => {
                // Check if transaction already exists
                const existingTx = await client.processed_transaction.findUnique({
                    where: { tx_id: tx.tx_id }
                });
                
                if (existingTx) {
                    logger.info('Transaction already exists, updating', { tx_id: tx.tx_id });
                    
                    // Update the transaction
                    await client.processed_transaction.update({
                        where: { tx_id: tx.tx_id },
                        data: {
                            block_height: safeBlockHeight,
                            block_time: tx.block_time ? new Date(tx.block_time) : new Date(),
                            author_address: tx.author_address,
                            metadata: tx.metadata || {}
                        }
                    });
                } else {
                    logger.info('Creating new transaction', { tx_id: tx.tx_id });
                    
                    // Create a new transaction
                    await client.processed_transaction.create({
                        data: {
                            tx_id: tx.tx_id,
                            type: tx.type || 'unknown',
                            block_height: safeBlockHeight,
                            block_time: tx.block_time ? new Date(tx.block_time) : new Date(),
                            author_address: tx.author_address,
                            metadata: tx.metadata || {}
                        }
                    });
                }
            });
            
            // Prepare post data
            const postData = {
                tx_id: tx.tx_id,
                content: tx.metadata?.content || '',
                author_address: tx.metadata?.author_address || tx.author_address,
                created_at: new Date(tx.block_time),
                tags: tx.metadata?.tags || [],
                is_vote: tx.type === 'vote',
                is_locked: !!tx.metadata?.lock_amount && tx.metadata.lock_amount > 0,
                metadata: tx.metadata
            };
            
            logger.debug('Prepared post data', {
                tx_id: tx.tx_id,
                postDataKeys: Object.keys(postData),
                author_address: postData.author_address,
                is_vote: postData.is_vote,
                is_locked: postData.is_locked,
                hasMetadata: !!postData.metadata
            });
            
            // Check for image data
            let imageBuffer: Buffer | null = null;
            if (tx.metadata?.image_metadata?.is_image && tx.metadata?.raw_image_data) {
                try {
                    // Convert image data to buffer based on format
                    if (typeof tx.metadata.raw_image_data === 'string') {
                        if (tx.metadata.raw_image_data.startsWith('data:')) {
                            // Handle data URI
                            const base64Data = tx.metadata.raw_image_data.split(',')[1];
                            imageBuffer = Buffer.from(base64Data, 'base64');
                        } else {
                            // Assume base64 string
                            imageBuffer = Buffer.from(tx.metadata.raw_image_data, 'base64');
                        }
                    } else if (Buffer.isBuffer(tx.metadata.raw_image_data)) {
                        // Already a buffer
                        imageBuffer = tx.metadata.raw_image_data;
                    }
                    
                    logger.debug('Processed image data', {
                        tx_id: tx.tx_id,
                        hasImageBuffer: !!imageBuffer,
                        bufferSize: imageBuffer?.length
                    });
                } catch (error) {
                    logger.error('Error processing image data', {
                        tx_id: tx.tx_id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            
            // Create or update the post
            const post = await this.withFreshClient(async (client) => {
                // Check if post already exists
                const existingPost = await client.post.findUnique({
                    where: { tx_id: tx.tx_id }
                });
                
                if (existingPost) {
                    logger.info('Post already exists, updating', { tx_id: tx.tx_id });
                    
                    // Update the post
                    return await client.post.update({
                        where: { tx_id: tx.tx_id },
                        data: {
                            content: postData.content,
                            tags: postData.tags,
                            is_vote: postData.is_vote,
                            is_locked: postData.is_locked,
                            metadata: postData.metadata,
                            ...(imageBuffer ? {
                                raw_image_data: imageBuffer,
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
                            content: postData.content,
                            author_address: postData.author_address,
                            created_at: postData.created_at,
                            tags: postData.tags,
                            is_vote: postData.is_vote,
                            is_locked: postData.is_locked,
                            block_height: safeBlockHeight,
                            metadata: postData.metadata,
                            ...(imageBuffer ? {
                                raw_image_data: imageBuffer,
                                media_type: tx.metadata?.image_metadata?.content_type || 'image/jpeg'
                            } : {})
                        }
                    });
                }
            });
            
            // If this is a vote post, create vote options
            if (postData.is_vote && tx.metadata?.vote_options && Array.isArray(tx.metadata.vote_options)) {
                const voteOptions = tx.metadata.vote_options;
                
                logger.debug('Processing vote options', {
                    tx_id: tx.tx_id,
                    optionsCount: voteOptions.length
                });
                
                // Create each vote option
                for (let i = 0; i < voteOptions.length; i++) {
                    const option = voteOptions[i];
                    
                    await this.withFreshClient(async (client) => {
                        // Check if option already exists
                        const existingOption = await client.vote_option.findFirst({
                            where: {
                                post_id: post.id,
                                option_index: i
                            }
                        });
                        
                        if (existingOption) {
                            logger.debug('Vote option already exists, updating', {
                                tx_id: tx.tx_id,
                                option_index: i
                            });
                            
                            // Update the option
                            await client.vote_option.update({
                                where: { id: existingOption.id },
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
                                    author_address: postData.author_address,
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
                is_vote: postData.is_vote,
                is_locked: postData.is_locked
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
    public async saveTransaction(tx: ParsedTransaction): Promise<ProcessedTransaction> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            logger.debug('Saving transaction', { tx_id: tx.tx_id });
            
            // Convert BigInt values to numbers
            const safeBlockHeight = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // Create the transaction data with snake_case fields
            const txData = {
                tx_id: tx.tx_id,
                type: tx.type || 'unknown',
                author_address: tx.author_address || '',
                block_height: safeBlockHeight,
                block_time: tx.block_time ? new Date(tx.block_time) : new Date(),
                metadata: tx.metadata || {}
            };
            
            // Save the transaction
            const savedTx = await this.withFreshClient(async (client) => {
                return await client.processed_transaction.upsert({
                    where: { tx_id: tx.tx_id },
                    update: txData,
                    create: txData
                });
            });
            
            logger.debug('Transaction saved successfully', { 
                tx_id: savedTx.tx_id,
                type: savedTx.type
            });
            
            return savedTx;
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
    public async getTransaction(tx_id: string): Promise<ProcessedTransaction | null> {
        if (!tx_id) {
            throw new Error('Invalid transaction ID');
        }
        
        try {
            logger.debug('Getting transaction', { tx_id });
            
            // Get the transaction
            const tx = await this.withFreshClient(async (client) => {
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

    async connect(): Promise<boolean> {
        logger.info(`Connecting to database`, { instanceId: this.instanceId });
        try {
            await prisma.$connect();
            logger.info(`Successfully connected to database`, { instanceId: this.instanceId });
            return true;
        } catch (error) {
            logger.error(`Failed to connect to database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    async disconnect(): Promise<void> {
        logger.info(`Disconnecting from database`, { instanceId: this.instanceId });
        try {
            await prisma.$disconnect();
            logger.info(`Successfully disconnected from database`, { instanceId: this.instanceId });
        } catch (error) {
            logger.error(`Error disconnecting from database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async isConnected(): Promise<boolean> {
        logger.debug(`Checking database connection`, { instanceId: this.instanceId });
        try {
            await prisma.$queryRaw`SELECT 1`;
            logger.debug(`Database connection is active`, { instanceId: this.instanceId });
            return true;
        } catch (error) {
            logger.warn(`Database connection is inactive`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    private isRetryableError(error: unknown): boolean {
        const dbError = error as DbError;
        // Retry on connection errors or deadlocks
        return dbError.code === '40001' || // serialization failure
               dbError.code === '40P01' || // deadlock
               dbError.code === '57P01';   // connection lost
    }

    /**
     * Creates a JavaScript Date object from a block time value
     * Handles different formats of block_time (number, BigInt, string)
     * @param block_time Block time in seconds (Unix timestamp)
     * @returns JavaScript Date object
     */
    private createblock_timeDate(block_time?: number | BigInt | string | null): Date {
        try {
            // Handle undefined, null, or invalid input
            if (block_time === undefined || block_time === null) {
                return new Date();
            }
            
            // Convert various input types to number
            let block_timeNumber: number;
            
            if (typeof block_time === 'bigint') {
                block_timeNumber = Number(block_time);
            } else if (typeof block_time === 'string') {
                block_timeNumber = parseInt(block_time, 10);
            } else if (typeof block_time === 'number') {
                block_timeNumber = block_time;
            } else {
                logger.warn(' DB: INVALID BLOCK TIME TYPE', { 
                    block_time,
                    type: typeof block_time,
                    usingCurrentTime: true
                });
                return new Date();
            }
            
            // Check if the conversion resulted in a valid number
            if (isNaN(block_timeNumber)) {
                logger.warn(' DB: BLOCK TIME IS NaN', { 
                    block_time,
                    usingCurrentTime: true
                });
                return new Date();
            }
            
            // Convert seconds to milliseconds for JavaScript Date
            // Bitcoin timestamps are in seconds, JS Date expects milliseconds
            const timestampMs = block_timeNumber * 1000;
            
            // Validate the timestamp is reasonable (between 2009 and 100 years in the future)
            const minTimestamp = new Date('2009-01-03').getTime(); // Bitcoin genesis block
            const maxTimestamp = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // 100 years in the future
            
            if (timestampMs < minTimestamp || timestampMs > maxTimestamp) {
                logger.warn(' DB: INVALID BLOCK TIME RANGE', { 
                    block_time: block_timeNumber,
                    timestampMs,
                    minTimestamp,
                    maxTimestamp,
                    usingCurrentTime: true
                });
                return new Date();
            }
            
            return new Date(timestampMs);
        } catch (error) {
            logger.error(' DB: ERROR CREATING BLOCK TIME DATE', {
                block_time,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return new Date();
        }
    }

    async processTransactions(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                tx_ids: transactions.map(t => t.tx_id)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.processTransaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.processTransaction(t)));
            }
        } catch (error) {
            logger.error('Error in processTransactions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async getPostWithvote_options(post_id: string): Promise<PostWithvote_options | null> {
        const post = await prisma.post.findUnique({
            where: { id: post_id },
            include: {
                vote_options: true,
                lock_likes: true
            }
        });

        if (!post) return null;

        // Transform the Prisma Post into our custom PostWithvote_options type
        return {
            id: post.id,
            post_id: post.id,
            type: post.isVote ? 'vote' : 'post',
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
                index: option.optionIndex,
                created_at: option.created_at,
                updated_at: option.created_at, // Using created_at as updated_at
                question_id: option.id // Using option.id as question_id
            })),
            vote_question: null // We don't have a voteQuestion model in Prisma
        };
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withFreshClient(async (tx) => {
            await tx.vote_option.deleteMany();
            await tx.lock_like.deleteMany();
            await tx.post.deleteMany();
            await tx.processed_transaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    async verifyDatabaseContents(tx_id: string, testOutputDir: string) {
        // Get the processed transaction
        const processedTx = await this.getTransaction(tx_id);
        if (!processedTx) {
            throw new Error(`No processed transaction found for tx_id ${tx_id}`);
        }

        const metadata = processedTx.metadata as ProcessedTxMetadata;

        // Get the post with vote data
        const post = await this.getPostWithvote_options(metadata.post_id);
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
            const imagePath = path.join(testOutputDir, `${tx_id}_image.${ext}`);
            await fs.promises.writeFile(imagePath, post.image);
            logger.info('Saved image to file', { path: imagePath });
        }

        // Write verification results to file
        const outputPath = path.join(testOutputDir, `${tx_id}_verification.txt`);
        const outputContent = [
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

        await fs.promises.writeFile(outputPath, outputContent);
        logger.info('Saved verification results to file', { path: outputPath });
    }

    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        try {
            logger.debug('Getting current block height');
            
            // Try to get the latest block height from processed transactions
            const latestTx = await prisma.processed_transaction.findFirst({
                orderBy: {
                    block_height: 'desc'
                },
                where: {
                    block_height: {
                        gt: 0
                    }
                }
            });
            
            if (latestTx?.block_height) {
                logger.debug(`Using latest transaction block height: ${latestTx.block_height}`);
                return latestTx.block_height;
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

    // Save image data to database
    public async saveImage(params: {
        tx_id: string;
        imageData: Buffer | string;
        content_type: string;
        filename?: string;
        width?: number;
        height?: number;
        size?: number;
    }): Promise<void> {
        logger.debug('saveImage called with params', {
            tx_id: params.tx_id,
            content_type: params.content_type,
            imageDataType: typeof params.imageData,
            imageSize: typeof params.imageData === 'string' ? params.imageData.length : params.imageData?.length,
            hasFilename: !!params.filename
        });

        return this.withFreshClient(async (client) => {
            logger.debug('Inside withFreshClient callback', {
                clientType: typeof client,
                clientKeys: Object.keys(client),
                hasPrismaClient: !!client
            });

            try {
                // Convert image data to buffer based on format
                let imageBuffer: Buffer;
                if (typeof params.imageData === 'string') {
                    if (params.imageData.startsWith('data:')) {
                        // Handle data URI
                        const base64Data = params.imageData.split(',')[1];
                        imageBuffer = Buffer.from(base64Data, 'base64');
                    } else {
                        // Assume base64 string
                        imageBuffer = Buffer.from(params.imageData, 'base64');
                    }
                } else if (Buffer.isBuffer(params.imageData)) {
                    // Already a buffer
                    imageBuffer = params.imageData;
                } else {
                    // Fallback
                    imageBuffer = Buffer.from(params.imageData);
                }

                // Use upsert instead of update to handle cases where the post doesn't exist yet
                await client.post.upsert({
                    where: { tx_id: params.tx_id },
                    update: {
                        raw_image_data: imageBuffer,
                        media_type: params.content_type
                    },
                    create: {
                        tx_id: params.tx_id,
                        content: '',  // Required field, can be updated later
                        raw_image_data: imageBuffer,
                        media_type: params.content_type,
                        created_at: new Date()
                    }
                });

                logger.info('Successfully saved image data', {
                    tx_id: params.tx_id,
                    content_type: params.content_type,
                    size: params.size
                });
            } catch (error) {
                logger.error('Failed to save image data', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    tx_id: params.tx_id
                });
                throw error;
            }
        });
    }

    /**
     * Create a post from transaction data
     * @param tx Transaction data
     * @returns Created post
     */
    public async createPostFromTransaction(tx: ParsedTransaction): Promise<any> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            // Extract metadata
            const metadata = tx.metadata || {};
            
            // Convert BigInt values to numbers
            const safeBlockHeight = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // Create post with snake_case fields
            const post = await this.withFreshClient(async (client) => {
                return await client.post.create({
                    data: {
                        tx_id: tx.tx_id,
                        content: metadata.content || '',
                        author_address: tx.author_address || '',
                        tags: metadata.tags || [],
                        is_vote: metadata.is_vote === true,
                        is_locked: metadata.is_locked === true,
                        media_type: metadata.media_type || null,
                        media_url: metadata.media_url || null,
                        raw_image_data: metadata.raw_image_data || null,
                        block_height: safeBlockHeight,
                        metadata: metadata
                    }
                });
            });
            
            // If this is a vote post, create vote options
            if (metadata.is_vote && Array.isArray(metadata.vote_options)) {
                const voteOptions = metadata.vote_options;
                
                // Create each vote option
                for (let i = 0; i < voteOptions.length; i++) {
                    const option = voteOptions[i];
                    
                    await this.withFreshClient(async (client) => {
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
            
            return post;
        } catch (error) {
            logger.error(' DB: ERROR CREATING POST', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    async processTransactions(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                tx_ids: transactions.map(t => t.tx_id)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.processTransaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.processTransaction(t)));
            }
        } catch (error) {
            logger.error('Error in processTransactions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async getPostWithvote_options(post_id: string): Promise<PostWithvote_options | null> {
        const post = await prisma.post.findUnique({
            where: { id: post_id },
            include: {
                vote_options: true,
                lock_likes: true
            }
        });

        if (!post) return null;

        // Transform the Prisma Post into our custom PostWithvote_options type
        return {
            id: post.id,
            post_id: post.id,
            type: post.isVote ? 'vote' : 'post',
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
                index: option.optionIndex,
                created_at: option.created_at,
                updated_at: option.created_at, // Using created_at as updated_at
                question_id: option.id // Using option.id as question_id
            })),
            vote_question: null // We don't have a voteQuestion model in Prisma
        };
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withFreshClient(async (tx) => {
            await tx.vote_option.deleteMany();
            await tx.lock_like.deleteMany();
            await tx.post.deleteMany();
            await tx.processed_transaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    async verifyDatabaseContents(tx_id: string, testOutputDir: string) {
        // Get the processed transaction
        const processedTx = await this.getTransaction(tx_id);
        if (!processedTx) {
            throw new Error(`No processed transaction found for tx_id ${tx_id}`);
        }

        const metadata = processedTx.metadata as ProcessedTxMetadata;

        // Get the post with vote data
        const post = await this.getPostWithvote_options(metadata.post_id);
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
            const imagePath = path.join(testOutputDir, `${tx_id}_image.${ext}`);
            await fs.promises.writeFile(imagePath, post.image);
            logger.info('Saved image to file', { path: imagePath });
        }

        // Write verification results to file
        const outputPath = path.join(testOutputDir, `${tx_id}_verification.txt`);
        const outputContent = [
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

        await fs.promises.writeFile(outputPath, outputContent);
        logger.info('Saved verification results to file', { path: outputPath });
    }

    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        try {
            logger.debug('Getting current block height');
            
            // Try to get the latest block height from processed transactions
            const latestTx = await prisma.processed_transaction.findFirst({
                orderBy: {
                    block_height: 'desc'
                },
                where: {
                    block_height: {
                        gt: 0
                    }
                }
            });
            
            if (latestTx?.block_height) {
                logger.debug(`Using latest transaction block height: ${latestTx.block_height}`);
                return latestTx.block_height;
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

    // Save image data to database
    public async saveImage(params: {
        tx_id: string;
        imageData: Buffer | string;
        content_type: string;
        filename?: string;
        width?: number;
        height?: number;
        size?: number;
    }): Promise<void> {
        logger.debug('saveImage called with params', {
            tx_id: params.tx_id,
            content_type: params.content_type,
            imageDataType: typeof params.imageData,
            imageSize: typeof params.imageData === 'string' ? params.imageData.length : params.imageData?.length,
            hasFilename: !!params.filename
        });

        return this.withFreshClient(async (client) => {
            logger.debug('Inside withFreshClient callback', {
                clientType: typeof client,
                clientKeys: Object.keys(client),
                hasPrismaClient: !!client
            });

            try {
                // Convert image data to buffer based on format
                let imageBuffer: Buffer;
                if (typeof params.imageData === 'string') {
                    if (params.imageData.startsWith('data:')) {
                        // Handle data URI
                        const base64Data = params.imageData.split(',')[1];
                        imageBuffer = Buffer.from(base64Data, 'base64');
                    } else {
                        // Assume base64 string
                        imageBuffer = Buffer.from(params.imageData, 'base64');
                    }
                } else if (Buffer.isBuffer(params.imageData)) {
                    // Already a buffer
                    imageBuffer = params.imageData;
                } else {
                    // Fallback
                    imageBuffer = Buffer.from(params.imageData);
                }

                // Use upsert instead of update to handle cases where the post doesn't exist yet
                await client.post.upsert({
                    where: { tx_id: params.tx_id },
                    update: {
                        raw_image_data: imageBuffer,
                        media_type: params.content_type
                    },
                    create: {
                        tx_id: params.tx_id,
                        content: '',  // Required field, can be updated later
                        raw_image_data: imageBuffer,
                        media_type: params.content_type,
                        created_at: new Date()
                    }
                });

                logger.info('Successfully saved image data', {
                    tx_id: params.tx_id,
                    content_type: params.content_type,
                    size: params.size
                });
            } catch (error) {
                logger.error('Failed to save image data', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    tx_id: params.tx_id
                });
                throw error;
            }
        });
    }

    /**
     * Create a post from transaction data
     * @param tx Transaction data
     * @returns Created post
     */
    public async createPostFromTransaction(tx: ParsedTransaction): Promise<any> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            // Extract metadata
            const metadata = tx.metadata || {};
            
            // Convert BigInt values to numbers
            const safeBlockHeight = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // Create post with snake_case fields
            const post = await this.withFreshClient(async (client) => {
                return await client.post.create({
                    data: {
                        tx_id: tx.tx_id,
                        content: metadata.content || '',
                        author_address: tx.author_address || '',
                        tags: metadata.tags || [],
                        is_vote: metadata.is_vote === true,
                        is_locked: metadata.is_locked === true,
                        media_type: metadata.media_type || null,
                        media_url: metadata.media_url || null,
                        raw_image_data: metadata.raw_image_data || null,
                        block_height: safeBlockHeight,
                        metadata: metadata
                    }
                });
            });
            
            // If this is a vote post, create vote options
            if (metadata.is_vote && Array.isArray(metadata.vote_options)) {
                const voteOptions = metadata.vote_options;
                
                // Create each vote option
                for (let i = 0; i < voteOptions.length; i++) {
                    const option = voteOptions[i];
                    
                    await this.withFreshClient(async (client) => {
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
            
            return post;
        } catch (error) {
            logger.error(' DB: ERROR CREATING POST', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    async processTransactions(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                tx_ids: transactions.map(t => t.tx_id)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.processTransaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.processTransaction(t)));
            }
        } catch (error) {
            logger.error('Error in processTransactions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async getPostWithvote_options(post_id: string): Promise<PostWithvote_options | null> {
        const post = await prisma.post.findUnique({
            where: { id: post_id },
            include: {
                vote_options: true,
                lock_likes: true
            }
        });

        if (!post) return null;

        // Transform the Prisma Post into our custom PostWithvote_options type
        return {
            id: post.id,
            post_id: post.id,
            type: post.isVote ? 'vote' : 'post',
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
                index: option.optionIndex,
                created_at: option.created_at,
                updated_at: option.created_at, // Using created_at as updated_at
                question_id: option.id // Using option.id as question_id
            })),
            vote_question: null // We don't have a voteQuestion model in Prisma
        };
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withFreshClient(async (tx) => {
            await tx.vote_option.deleteMany();
            await tx.lock_like.deleteMany();
            await tx.post.deleteMany();
            await tx.processed_transaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    async verifyDatabaseContents(tx_id: string, testOutputDir: string) {
        // Get the processed transaction
        const processedTx = await this.getTransaction(tx_id);
        if (!processedTx) {
            throw new Error(`No processed transaction found for tx_id ${tx_id}`);
        }

        const metadata = processedTx.metadata as ProcessedTxMetadata;

        // Get the post with vote data
        const post = await this.getPostWithvote_options(metadata.post_id);
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
            const imagePath = path.join(testOutputDir, `${tx_id}_image.${ext}`);
            await fs.promises.writeFile(imagePath, post.image);
            logger.info('Saved image to file', { path: imagePath });
        }

        // Write verification results to file
        const outputPath = path.join(testOutputDir, `${tx_id}_verification.txt`);
        const outputContent = [
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

        await fs.promises.writeFile(outputPath, outputContent);
        logger.info('Saved verification results to file', { path: outputPath });
    }

    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        try {
            logger.debug('Getting current block height');
            
            // Try to get the latest block height from processed transactions
            const latestTx = await prisma.processed_transaction.findFirst({
                orderBy: {
                    block_height: 'desc'
                },
                where: {
                    block_height: {
                        gt: 0
                    }
                }
            });
            
            if (latestTx?.block_height) {
                logger.debug(`Using latest transaction block height: ${latestTx.block_height}`);
                return latestTx.block_height;
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

    // Save image data to database
    public async saveImage(params: {
        tx_id: string;
        imageData: Buffer | string;
        content_type: string;
        filename?: string;
        width?: number;
        height?: number;
        size?: number;
    }): Promise<void> {
        logger.debug('saveImage called with params', {
            tx_id: params.tx_id,
            content_type: params.content_type,
            imageDataType: typeof params.imageData,
            imageSize: typeof params.imageData === 'string' ? params.imageData.length : params.imageData?.length,
            hasFilename: !!params.filename
        });

        return this.withFreshClient(async (client) => {
            logger.debug('Inside withFreshClient callback', {
                clientType: typeof client,
                clientKeys: Object.keys(client),
                hasPrismaClient: !!client
            });

            try {
                // Convert image data to buffer based on format
                let imageBuffer: Buffer;
                if (typeof params.imageData === 'string') {
                    if (params.imageData.startsWith('data:')) {
                        // Handle data URI
                        const base64Data = params.imageData.split(',')[1];
                        imageBuffer = Buffer.from(base64Data, 'base64');
                    } else {
                        // Assume base64 string
                        imageBuffer = Buffer.from(params.imageData, 'base64');
                    }
                } else if (Buffer.isBuffer(params.imageData)) {
                    // Already a buffer
                    imageBuffer = params.imageData;
                } else {
                    // Fallback
                    imageBuffer = Buffer.from(params.imageData);
                }

                // Use upsert instead of update to handle cases where the post doesn't exist yet
                await client.post.upsert({
                    where: { tx_id: params.tx_id },
                    update: {
                        raw_image_data: imageBuffer,
                        media_type: params.content_type
                    },
                    create: {
                        tx_id: params.tx_id,
                        content: '',  // Required field, can be updated later
                        raw_image_data: imageBuffer,
                        media_type: params.content_type,
                        created_at: new Date()
                    }
                });

                logger.info('Successfully saved image data', {
                    tx_id: params.tx_id,
                    content_type: params.content_type,
                    size: params.size
                });
            } catch (error) {
                logger.error('Failed to save image data', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    tx_id: params.tx_id
                });
                throw error;
            }
        });
    }

    /**
     * Create a post from transaction data
     * @param tx Transaction data
     * @returns Created post
     */
    public async createPostFromTransaction(tx: ParsedTransaction): Promise<any> {
        if (!tx || !tx.tx_id) {
            throw new Error('Invalid transaction data');
        }
        
        try {
            // Extract metadata
            const metadata = tx.metadata || {};
            
            // Convert BigInt values to numbers
            const safeBlockHeight = typeof tx.block_height === 'bigint' 
                ? Number(tx.block_height) 
                : (tx.block_height || 0);
            
            // Create post with snake_case fields
            const post = await this.withFreshClient(async (client) => {
                return await client.post.create({
                    data: {
                        tx_id: tx.tx_id,
                        content: metadata.content || '',
                        author_address: tx.author_address || '',
                        tags: metadata.tags || [],
                        is_vote: metadata.is_vote === true,
                        is_locked: metadata.is_locked === true,
                        media_type: metadata.media_type || null,
                        media_url: metadata.media_url || null,
                        raw_image_data: metadata.raw_image_data || null,
                        block_height: safeBlockHeight,
                        metadata: metadata
                    }
                });
            });
            
            // If this is a vote post, create vote options
            if (metadata.is_vote && Array.isArray(metadata.vote_options)) {
                const voteOptions = metadata.vote_options;
                
                // Create each vote option
                for (let i = 0; i < voteOptions.length; i++) {
                    const option = voteOptions[i];
                    
                    await this.withFreshClient(async (client) => {
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
            
            return post;
        } catch (error) {
            logger.error(' DB: ERROR CREATING POST', {
                tx_id: tx.tx_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }
}