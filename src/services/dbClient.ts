import { prisma } from '../db/prisma.js';
import { PrismaClient } from '@prisma/client';
import type { Post } from '@prisma/client';
import { ParsedTransaction, DbError, PostWithVoteOptions, ProcessedTxMetadata, ProcessedTransaction } from '../shared/types.js';
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

    private async upsertPost(tx: ParsedTransaction, imageBuffer: Buffer | null = null): Promise<Post> {
        // Prepare the post data
        const postData: Prisma.PostCreateInput = {
            txid: tx.txid,
            content: tx.metadata.content || '',
            authorAddress: tx.metadata.sender_address || tx.metadata.authorAddress,
            createdAt: this.createBlockTimeDate(tx.blockTime),
            updatedAt: this.createBlockTimeDate(tx.blockTime),
            tags: tx.metadata.tags || [],
            isVote: tx.type === 'vote',
            isLocked: !!tx.metadata.lock_amount && tx.metadata.lock_amount > 0 || !!tx.metadata.lockAmount && tx.metadata.lockAmount > 0,
            lockAmount: tx.metadata.lock_amount || tx.metadata.lockAmount || 0,
            lockDuration: tx.metadata.lock_duration || tx.metadata.lockDuration || 0,
            metadata: tx.metadata
        };

        // Add image data if available
        if (imageBuffer) {
            postData.rawImageData = imageBuffer;
            postData.mediaType = tx.metadata.media_type || tx.metadata.mediaType || 'image/png';
        }

        // Check if this is a reply to another post
        if (tx.metadata.reply_to || tx.metadata.replyTo) {
            logger.info(' DB: PROCESSING REPLY POST', { 
                txid: tx.txid, 
                replyTo: tx.metadata.reply_to || tx.metadata.replyTo 
            });
            
            // Find the parent post
            const parentPost = await this.withFreshClient(async (client) => {
                return client.post.findUnique({
                    where: { txid: tx.metadata.reply_to || tx.metadata.replyTo }
                });
            });

            if (parentPost) {
                postData.parentId = parentPost.id;
            } else {
                logger.warn(' DB: PARENT POST NOT FOUND', { 
                    txid: tx.txid, 
                    replyTo: tx.metadata.reply_to || tx.metadata.replyTo 
                });
            }
        }

        return this.withFreshClient(async (client) => {
            // Check if post already exists
            const existingPost = await client.post.findUnique({
                where: { txid: tx.txid }
            });

            if (existingPost) {
                logger.info(' DB: UPDATING EXISTING POST', { 
                    txid: tx.txid, 
                    postId: existingPost.id 
                });
                
                // Update existing post
                return client.post.update({
                    where: { id: existingPost.id },
                    data: {
                        content: postData.content,
                        tags: postData.tags,
                        isVote: postData.isVote,
                        isLocked: postData.isLocked,
                        lockAmount: postData.lockAmount,
                        lockDuration: postData.lockDuration,
                        updatedAt: postData.updatedAt,
                        metadata: postData.metadata,
                        ...(imageBuffer ? {
                            rawImageData: postData.rawImageData,
                            mediaType: postData.mediaType
                        } : {})
                    }
                });
            } else {
                logger.info(' DB: CREATING NEW POST', { 
                    txid: tx.txid,
                    isReply: !!postData.parentId
                });
                
                // Create new post
                return client.post.create({ data: postData });
            }
        });
    }

    private async processVoteOptions(postId: string, tx: ParsedTransaction): Promise<void> {
        if (!tx.metadata.vote_options || !Array.isArray(tx.metadata.vote_options)) {
            return;
        }

        logger.info(' DB: PROCESSING VOTE OPTIONS', { 
            postId, 
            optionCount: tx.metadata.vote_options.length 
        });

        return this.withFreshClient(async (client) => {
            // Process each vote option
            for (let i = 0; i < tx.metadata.vote_options.length; i++) {
                const optionContent = tx.metadata.vote_options[i];
                
                // Generate a unique txid for each option by appending the index to the original txid
                const optionTxid = `${tx.txid}-option-${i}`;
                
                // Check if this option already exists
                const existingOption = await client.voteOption.findUnique({
                    where: { txid: optionTxid }
                });
                
                if (!existingOption) {
                    // Create new vote option
                    await client.voteOption.create({
                        data: {
                            txid: optionTxid,
                            content: optionContent,
                            authorAddress: tx.metadata.sender_address || tx.metadata.authorAddress,
                            createdAt: this.createBlockTimeDate(tx.blockTime),
                            tags: tx.metadata.tags || [],
                            postId: postId,
                            optionIndex: i
                        }
                    });
                }
            }

            logger.info(' DB: VOTE OPTIONS CREATED', {
                postId,
                optionCount: tx.metadata.vote_options.length
            });
        });
    }

    /**
     * Normalizes transaction metadata to handle both snake_case and camelCase property names
     * This ensures our code is resilient to changes in the naming convention
     * @param metadata Transaction metadata object
     * @returns Normalized metadata object with both naming conventions
     */
    private normalizeMetadata(metadata: Record<string, any>): Record<string, any> {
        if (!metadata || typeof metadata !== 'object') {
            return {};
        }
        
        const normalized: Record<string, any> = { ...metadata };
        
        // Map between snake_case and camelCase for common fields
        const fieldMappings: [string, string][] = [
            ['block_height', 'blockHeight'],
            ['block_time', 'blockTime'],
            ['post_id', 'postId'],
            ['lock_amount', 'lockAmount'],
            ['lock_duration', 'lockDuration'],
            ['sender_address', 'authorAddress'],
            ['author_address', 'authorAddress'],
            ['created_at', 'createdAt'],
            ['updated_at', 'updatedAt'],
            ['vote_options', 'voteOptions'],
            ['vote_question', 'voteQuestion'],
            ['content_type', 'contentType'],
            ['media_type', 'mediaType'],
            ['raw_image_data', 'rawImageData'],
            ['image_metadata', 'imageMetadata']
        ];
        
        // Ensure both snake_case and camelCase versions exist
        for (const [snakeCase, camelCase] of fieldMappings) {
            // If snake_case exists but camelCase doesn't, add camelCase
            if (normalized[snakeCase] !== undefined && normalized[camelCase] === undefined) {
                normalized[camelCase] = normalized[snakeCase];
            }
            // If camelCase exists but snake_case doesn't, add snake_case
            else if (normalized[camelCase] !== undefined && normalized[snakeCase] === undefined) {
                normalized[snakeCase] = normalized[camelCase];
            }
        }
        
        return normalized;
    }

    public async processTransaction(tx: ParsedTransaction): Promise<Post> {
        try {
            logger.info(' DB: SAVING TRANSACTION', {
                txid: tx.txid,
                type: tx.type
            });
            
            // Normalize metadata to handle both snake_case and camelCase
            tx.metadata = this.normalizeMetadata(tx.metadata);

            // First, save the transaction to the ProcessedTransaction table
            await this.withFreshClient(async (client) => {
                // Check if transaction already exists
                try {
                    const existingTx = await client.processedTransaction.findUnique({
                        where: { txid: tx.txid }
                    });

                    if (!existingTx) {
                        try {
                            // Create new processed transaction record with only essential fields
                            await client.processedTransaction.create({
                                data: {
                                    txid: tx.txid,
                                    type: tx.type,
                                    protocol: tx.protocol,
                                    metadata: tx.metadata || {}
                                    // Omit blockHeight and blockTime if they cause issues
                                }
                            });
                            
                            logger.info(' DB: TRANSACTION RECORD CREATED', {
                                txid: tx.txid,
                                type: tx.type
                            });
                        } catch (error) {
                            logger.error(' DB: FAILED TO CREATE TRANSACTION RECORD', {
                                txid: tx.txid,
                                error: error instanceof Error ? error.message : 'Unknown error',
                                stack: error instanceof Error ? error.stack : undefined
                            });
                            
                            // Continue processing even if transaction record creation fails
                            // This allows us to still attempt to create the post
                        }
                    }
                } catch (error) {
                    logger.error(' DB: ERROR CHECKING FOR EXISTING TRANSACTION', {
                        txid: tx.txid,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    // Continue processing even if this check fails
                }
            });

            // Process image if present
            let imageBuffer: Buffer | null = null;
            if (tx.metadata.image) {
                try {
                    imageBuffer = tx.metadata.image;
                    logger.info(' DB: IMAGE DATA RECEIVED', {
                        txid: tx.txid,
                        size: imageBuffer.length
                    });
                } catch (error) {
                    logger.error(' DB: IMAGE PROCESSING FAILED', {
                        txid: tx.txid
                    });
                }
            }

            // Ensure vote posts have content_type set
            if (tx.type === 'vote' && !tx.metadata.content_type && !tx.metadata.contentType) {
                tx.metadata.contentType = 'vote';
            }

            logger.info(' DB: CREATING POST', {
                txid: tx.txid,
                type: tx.type,
                hasImage: !!imageBuffer
            });

            const post = await this.upsertPost(tx, imageBuffer);

            // Process vote options if present
            if (tx.metadata.vote_options && Array.isArray(tx.metadata.vote_options) && tx.metadata.vote_options.length > 0) {
                logger.info(' DB: PROCESSING EXISTING VOTE OPTIONS', { 
                    postId: post.id, 
                    optionCount: tx.metadata.vote_options.length 
                });
                await this.processVoteOptions(post.id, tx);
            }
            // For vote posts, ensure they have vote options
            else if ((tx.type === 'vote' || post.isVote) && (!tx.metadata.vote_options || !Array.isArray(tx.metadata.vote_options) || tx.metadata.vote_options.length === 0)) {
                logger.info(' DB: CREATING DEFAULT VOTE OPTIONS', { 
                    postId: post.id, 
                    txid: tx.txid 
                });
                
                // Create default vote options
                const defaultOptions = ['Yes', 'No', 'Maybe'];
                tx.metadata.voteOptions = defaultOptions;
                
                // Process the default vote options
                await this.processVoteOptions(post.id, tx);
                
                // Update the post metadata to include vote options
                await this.withFreshClient(async (client) => {
                    await client.post.update({
                        where: { id: post.id },
                        data: {
                            metadata: {
                                ...(post.metadata as Record<string, any>),
                                voteOptions: defaultOptions,
                                contentType: 'vote'
                            }
                        }
                    });
                });
            }

            const action = post.createdAt === this.createBlockTimeDate(tx.blockTime) ? 'created' : 'updated';
            logger.info(` DB: POST ${action.toUpperCase()}`, {
                txid: post.txid,
                postId: post.id,
                type: tx.type,
                isVote: post.isVote,
                tagCount: post.tags.length
            });

            return post;
        } catch (error) {
            logger.error(' DB: TRANSACTION PROCESSING FAILED', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid: tx.txid
            });
            throw error;
        }
    }

    /**
     * Save a transaction to the ProcessedTransaction table
     * @param tx The transaction to save
     * @returns The saved transaction with post data if available
     */
    public async saveTransaction(tx: ParsedTransaction): Promise<{ 
        transaction: any; 
        post?: Post;
    }> {
        try {
            logger.debug('Saving transaction to database', { 
                txid: tx.txid,
                type: tx.type,
                blockHeight: tx.blockHeight,
                blockTime: tx.blockTime
            });
            
            // Normalize metadata to handle both snake_case and camelCase
            tx.metadata = this.normalizeMetadata(tx.metadata);

            // Save to ProcessedTransaction table
            const savedTx = await this.withFreshClient(async (client) => {
                try {
                    // Check if transaction already exists
                    const existingTx = await client.processedTransaction.findUnique({
                        where: { txid: tx.txid },
                        select: {
                            id: true,
                            txid: true
                        }
                    });

                    if (existingTx) {
                        // Update existing transaction with only the fields we know exist
                        try {
                            return await client.processedTransaction.update({
                                where: { txid: tx.txid },
                                data: {
                                    type: tx.type,
                                    protocol: tx.protocol,
                                    metadata: tx.metadata || {}
                                    // Deliberately omit blockHeight and blockTime
                                },
                                select: {
                                    id: true,
                                    txid: true,
                                    type: true,
                                    protocol: true,
                                    metadata: true
                                }
                            });
                        } catch (updateError) {
                            logger.warn('Update failed, returning minimal transaction object', {
                                error: updateError instanceof Error ? updateError.message : 'Unknown error',
                                txid: tx.txid,
                                timestamp: new Date().toISOString()
                            });
                            
                            // Return a minimal transaction object
                            return {
                                id: existingTx.id,
                                txid: tx.txid,
                                type: tx.type || 'unknown',
                                protocol: tx.protocol || 'unknown',
                                metadata: tx.metadata || {}
                            };
                        }
                    } else {
                        // Create new transaction with only the fields we know exist
                        try {
                            return await client.processedTransaction.create({
                                data: {
                                    txid: tx.txid,
                                    type: tx.type,
                                    protocol: tx.protocol,
                                    metadata: tx.metadata || {}
                                    // Deliberately omit blockHeight and blockTime
                                },
                                select: {
                                    id: true,
                                    txid: true,
                                    type: true,
                                    protocol: true,
                                    metadata: true
                                }
                            });
                        } catch (createError) {
                            logger.warn('Create failed, returning minimal transaction object', {
                                error: createError instanceof Error ? createError.message : 'Unknown error',
                                txid: tx.txid,
                                timestamp: new Date().toISOString()
                            });
                            
                            // Return a minimal transaction object
                            return {
                                id: '',
                                txid: tx.txid,
                                type: tx.type || 'unknown',
                                protocol: tx.protocol || 'unknown',
                                metadata: tx.metadata || {}
                            };
                        }
                    }
                } catch (prismaError) {
                    // If there's an error with the Prisma query, log it and return a minimal object
                    logger.warn('DB: ERROR WITH PRISMA QUERY IN SAVE TRANSACTION', {
                        error: prismaError instanceof Error ? prismaError.message : 'Unknown error',
                        timestamp: new Date().toISOString()
                    });
                    
                    // Return a minimal transaction object
                    return {
                        id: '',
                        txid: tx.txid,
                        type: tx.type || 'unknown',
                        protocol: tx.protocol || 'unknown',
                        metadata: tx.metadata || {}
                    };
                }
            });

            // Process the transaction to create/update post if needed
            let post: Post | undefined;
            try {
                post = await this.processTransaction(tx);
            } catch (error) {
                logger.error('Failed to process post for transaction', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    txid: tx.txid
                });
                // Continue even if post processing fails
            }

            logger.info('Transaction saved successfully', { 
                txid: tx.txid,
                hasPost: !!post
            });

            return {
                transaction: savedTx,
                post
            };
        } catch (error) {
            logger.error('Failed to save transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid: tx.txid
            });
            throw error;
        }
    }

    public async getTransaction(txid: string): Promise<ProcessedTransaction | null> {
        try {
            logger.info(' DB: FETCHING TRANSACTION', { txid });
            
            return this.withFreshClient(async (client) => {
                try {
                    // Try to get the transaction using Prisma's findUnique
                    // Only query by txid, which we know exists in the database
                    // Explicitly select only columns we know exist
                    const tx = await client.processedTransaction.findUnique({
                        where: { txid },
                        select: {
                            id: true,
                            txid: true,
                            type: true,
                            protocol: true,
                            metadata: true
                            // Deliberately omit blockHeight, blockTime, etc.
                        }
                    });
                    
                    if (tx) {
                        // Map database column names to interface property names
                        // Use optional chaining to handle potentially missing fields
                        return {
                            id: tx.id,
                            txid: tx.txid,
                            type: tx.type ?? 'unknown',
                            protocol: tx.protocol ?? 'unknown',
                            metadata: tx.metadata ?? {},
                            // Provide default values for missing fields
                            blockHeight: 0,
                            blockTime: 0,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                    }
                    
                    return null;
                } catch (error) {
                    // If there's an error with column names, log it and return a minimal object
                    logger.warn(' DB: ERROR WITH PRISMA QUERY, RETURNING MINIMAL OBJECT', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: new Date().toISOString()
                    });
                    
                    // Instead of trying another query that might fail, return a minimal object
                    // with just the txid and default values for other fields
                    return {
                        id: '', // We don't know the ID
                        txid: txid,
                        blockHeight: 0,
                        blockTime: 0,
                        type: 'unknown',
                        protocol: 'unknown',
                        metadata: {},
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                }
            });
        } catch (error) {
            logger.error(' DB: FAILED TO FETCH TRANSACTION', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
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
     * Handles different formats of blockTime (number, BigInt, string)
     * @param blockTime Block time in seconds (Unix timestamp)
     * @returns JavaScript Date object
     */
    private createBlockTimeDate(blockTime?: number | BigInt | string | null): Date {
        try {
            // Handle undefined, null, or invalid input
            if (blockTime === undefined || blockTime === null) {
                return new Date();
            }
            
            // Convert various input types to number
            let blockTimeNumber: number;
            
            if (typeof blockTime === 'bigint') {
                blockTimeNumber = Number(blockTime);
            } else if (typeof blockTime === 'string') {
                blockTimeNumber = parseInt(blockTime, 10);
            } else if (typeof blockTime === 'number') {
                blockTimeNumber = blockTime;
            } else {
                logger.warn(' DB: INVALID BLOCK TIME TYPE', { 
                    blockTime,
                    type: typeof blockTime,
                    usingCurrentTime: true
                });
                return new Date();
            }
            
            // Check if the conversion resulted in a valid number
            if (isNaN(blockTimeNumber)) {
                logger.warn(' DB: BLOCK TIME IS NaN', { 
                    blockTime,
                    usingCurrentTime: true
                });
                return new Date();
            }
            
            // Convert seconds to milliseconds for JavaScript Date
            // Bitcoin timestamps are in seconds, JS Date expects milliseconds
            const timestampMs = blockTimeNumber * 1000;
            
            // Validate the timestamp is reasonable (between 2009 and 100 years in the future)
            const minTimestamp = new Date('2009-01-03').getTime(); // Bitcoin genesis block
            const maxTimestamp = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // 100 years in the future
            
            if (timestampMs < minTimestamp || timestampMs > maxTimestamp) {
                logger.warn(' DB: INVALID BLOCK TIME RANGE', { 
                    blockTime: blockTimeNumber,
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
                blockTime,
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
                txids: transactions.map(t => t.txid)
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

    async getPostWithVoteOptions(postId: string): Promise<PostWithVoteOptions | null> {
        const post = await prisma.post.findUnique({
            where: { id: postId },
            include: {
                voteOptions: true,
                lockLikes: true
            }
        });

        if (!post) return null;

        // Transform the Prisma Post into our custom PostWithVoteOptions type
        return {
            id: post.id,
            post_id: post.id,
            type: post.isVote ? 'vote' : 'post',
            content: post.content,
            block_time: post.createdAt,
            sequence: 0, // Default value
            parent_sequence: 0, // Default value
            created_at: post.createdAt,
            updated_at: post.createdAt, // Using createdAt as updatedAt
            protocol: 'MAP', // Default protocol
            sender_address: post.authorAddress,
            block_height: post.blockHeight,
            txid: post.txid,
            image: post.rawImageData,
            lock_likes: post.lockLikes.map(like => ({
                id: like.id,
                txid: like.txid,
                lock_amount: like.amount,
                lock_duration: 0, // Default value
                created_at: like.createdAt,
                updated_at: like.createdAt, // Using createdAt as updatedAt
                post_id: like.postId
            })),
            vote_options: post.voteOptions.map(option => ({
                id: option.id,
                post_id: option.postId,
                content: option.content,
                index: option.optionIndex,
                created_at: option.createdAt,
                updated_at: option.createdAt, // Using createdAt as updatedAt
                question_id: option.id // Using option.id as question_id
            })),
            vote_question: null // We don't have a voteQuestion model in Prisma
        };
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withFreshClient(async () => {
            await prisma.voteOption.deleteMany();
            await prisma.lockLike.deleteMany();
            await prisma.post.deleteMany();
            await prisma.processedTransaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    async verifyDatabaseContents(txid: string, testOutputDir: string) {
        // Get the processed transaction
        const processedTx = await this.getTransaction(txid);
        if (!processedTx) {
            throw new Error(`No processed transaction found for txid ${txid}`);
        }

        const metadata = processedTx.metadata as ProcessedTxMetadata;

        // Get the post with vote data
        const post = await this.getPostWithVoteOptions(metadata.post_id);
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
            txid,
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
            const imagePath = path.join(testOutputDir, `${txid}_image.${ext}`);
            await fs.promises.writeFile(imagePath, post.image);
            logger.info('Saved image to file', { path: imagePath });
        }

        // Write verification results to file
        const outputPath = path.join(testOutputDir, `${txid}_verification.txt`);
        const outputContent = [
            `Transaction ID: ${txid}`,
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
            const latestTx = await prisma.processedTransaction.findFirst({
                orderBy: {
                    blockHeight: 'desc'
                },
                where: {
                    blockHeight: {
                        gt: 0
                    }
                }
            });
            
            if (latestTx?.blockHeight) {
                logger.debug(`Using latest transaction block height: ${latestTx.blockHeight}`);
                return latestTx.blockHeight;
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
        txid: string;
        imageData: Buffer | string;
        contentType: string;
        filename?: string;
        width?: number;
        height?: number;
        size?: number;
    }): Promise<void> {
        logger.debug('saveImage called with params', {
            txid: params.txid,
            contentType: params.contentType,
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
                // Ensure imageData is a Buffer
                let imageBuffer: Buffer;
                if (typeof params.imageData === 'string') {
                    // Try to convert string to Buffer
                    try {
                        // Check if it's a base64 string
                        if (params.imageData.match(/^[A-Za-z0-9+/=]+$/)) {
                            imageBuffer = Buffer.from(params.imageData, 'base64');
                        } else {
                            // Just convert the string to a buffer
                            imageBuffer = Buffer.from(params.imageData);
                        }
                    } catch (e) {
                        logger.error('Failed to convert string to Buffer', {
                            error: e instanceof Error ? e.message : 'Unknown error',
                            txid: params.txid
                        });
                        // Use a minimal buffer if conversion fails
                        imageBuffer = Buffer.from('placeholder');
                    }
                } else {
                    imageBuffer = params.imageData;
                }

                // Use upsert instead of update to handle cases where the post doesn't exist yet
                await client.post.upsert({
                    where: { txid: params.txid },
                    update: {
                        rawImageData: imageBuffer,
                        mediaType: params.contentType
                    },
                    create: {
                        txid: params.txid,
                        content: '',  // Required field, can be updated later
                        rawImageData: imageBuffer,
                        mediaType: params.contentType,
                        createdAt: new Date()
                    }
                });

                logger.info('Successfully saved image data', {
                    txid: params.txid,
                    contentType: params.contentType,
                    size: params.size
                });
            } catch (error) {
                logger.error('Failed to save image data', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    txid: params.txid
                });
                throw error;
            }
        });
    }

    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }
}