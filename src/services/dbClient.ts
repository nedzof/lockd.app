import { prisma } from '../db/prisma.js';
import { PrismaClient } from '@prisma/client';
import type { Post, LockLike, VoteOption } from '@prisma/client';
import { Post as SharedPost, ParsedTransaction, DbError, PostWithVoteOptions, ProcessedTxMetadata } from '../shared/types.js';
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

    private async withFreshClient<T>(operation: (client: PrismaClient) => Promise<T>): Promise<T> {
        // Create a new client for this operation
        logger.debug('Creating fresh PrismaClient instance', {
            instanceId: this.instanceId,
            dbUrl: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@').split('?')[0],
            isPrismaClientDefined: typeof PrismaClient !== 'undefined',
            directUrl: process.env.DIRECT_URL?.replace(/:[^:@]*@/, ':****@').split('?')[0],
        });

        try {
            // Always use DIRECT_URL to bypass PgBouncer for operations that need prepared statements
            const client = new PrismaClient({
                datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
                log: [
                    { level: 'error', emit: 'stdout' },
                    { level: 'warn', emit: 'stdout' },
                ],
            });
            
            logger.debug('PrismaClient instance created', {
                clientType: typeof client,
                clientMethods: Object.keys(client),
                hasConnectMethod: typeof client.$connect === 'function',
                usingDirectUrl: !!process.env.DIRECT_URL
            });

            try {
                await client.$connect();
                
                // Set a timeout to prevent hanging operations
                const timeoutPromise = new Promise<T>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Database operation timed out after 10 seconds'));
                    }, 10000);
                });

                // Race the operation against the timeout
                const result = await Promise.race([
                    operation(client),
                    timeoutPromise
                ]);

                return result;
            } catch (error) {
                logger.error('Database operation failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    instanceId: this.instanceId
                });
                throw error;
            } finally {
                // Simply disconnect without deallocating prepared statements
                await client.$disconnect();
            }
        } catch (error) {
            logger.error('Failed to create PrismaClient instance', {
                error: error instanceof Error ? error.message : 'Unknown error',
                instanceId: this.instanceId
            });
            throw error;
        }
    }

    private async upsertPost(tx: ParsedTransaction, imageBuffer: Buffer | null): Promise<Post> {
        const postData = {
            txid: tx.txid,
            content: tx.metadata.content,
            authorAddress: tx.metadata.senderAddress,
            blockHeight: tx.blockHeight,
            createdAt: this.createBlockTimeDate(tx.blockTime),
            rawImageData: imageBuffer,
            tags: tx.metadata.tags || [],
            metadata: tx.metadata || {},
            isLocked: tx.type === 'lock',
            isVote: tx.type === 'vote' || !!tx.metadata.voteOptions || tx.metadata.contentType === 'vote'
        };

        return this.withFreshClient(async (client) => {
            // Try to find existing post
            const existingPost = await client.post.findUnique({
                where: { txid: tx.txid }
            });

            let post;
            if (existingPost) {
                // Update existing post
                post = await client.post.update({
                    where: { id: existingPost.id },
                    data: postData
                });
            } else {
                // Create new post
                post = await client.post.create({
                    data: postData
                });
            }

            // Process vote options if present
            if (tx.metadata.voteOptions && Array.isArray(tx.metadata.voteOptions) && tx.metadata.voteOptions.length > 0) {
                await this.processVoteOptions(post.id, tx);
            }

            return post;
        });
    }

    private async processVoteOptions(postId: string, tx: ParsedTransaction): Promise<void> {
        if (!tx.metadata.voteOptions || !Array.isArray(tx.metadata.voteOptions)) {
            return;
        }

        return this.withFreshClient(async (client) => {
            // Process each vote option
            for (let i = 0; i < tx.metadata.voteOptions.length; i++) {
                const optionContent = tx.metadata.voteOptions[i];
                const lockAmount = tx.metadata.lockAmount || 0;
                const lockDuration = tx.metadata.lockDuration || 0;
                
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
                            authorAddress: tx.metadata.senderAddress,
                            createdAt: this.createBlockTimeDate(tx.blockTime),
                            tags: tx.metadata.tags || [],
                            postId: postId,
                            optionIndex: i
                        }
                    });
                    
                    logger.info(`Created vote option for post`, {
                        postId,
                        optionIndex: i,
                        content: optionContent
                    });
                }
            }
        });
    }

    public async processTransaction(tx: ParsedTransaction): Promise<Post> {
        try {
            // First, save the transaction to the ProcessedTransaction table
            await this.withFreshClient(async (client) => {
                // Check if transaction already exists
                const existingTx = await client.processedTransaction.findUnique({
                    where: { txid: tx.txid }
                });

                if (!existingTx) {
                    // Create new processed transaction record
                    await client.processedTransaction.create({
                        data: {
                            txid: tx.txid,
                            type: tx.type,
                            protocol: tx.protocol,
                            blockHeight: tx.blockHeight || 0,
                            blockTime: tx.blockTime || 0,
                            metadata: tx.metadata || {}
                        }
                    });
                    
                    logger.info('Transaction saved to ProcessedTransaction table', {
                        txid: tx.txid,
                        type: tx.type,
                        blockHeight: tx.blockHeight
                    });
                }
            });

            // Process image if present
            let imageBuffer: Buffer | null = null;
            if (tx.metadata?.image) {
                try {
                    imageBuffer = await this.processImage(tx.metadata.image);
                } catch (error) {
                    logger.error('Failed to process image', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        txid: tx.txid
                    });
                }
            }

            // Ensure vote posts have content_type set
            if (tx.type === 'vote' && !tx.metadata.contentType) {
                tx.metadata.contentType = 'vote';
                logger.debug('Set contentType for vote post', { txid: tx.txid });
            }

            const post = await this.upsertPost(tx, imageBuffer);

            // For vote posts, ensure they have vote options
            if ((tx.type === 'vote' || post.isVote) && (!tx.metadata.voteOptions || !Array.isArray(tx.metadata.voteOptions) || tx.metadata.voteOptions.length === 0)) {
                logger.info('Creating default vote options for vote post', { postId: post.id, txid: tx.txid });
                
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
                                ...post.metadata,
                                voteOptions: defaultOptions,
                                contentType: 'vote'
                            }
                        }
                    });
                });
            }

            const action = post.createdAt === this.createBlockTimeDate(tx.blockTime) ? 'created' : 'updated';
            logger.info(`✅ Post ${action} successfully`, {
                txid: post.txid,
                hasImage: !!imageBuffer,
                imageSize: imageBuffer?.length,
                tags: post.tags,
                isVote: post.isVote,
                contentType: tx.metadata.contentType
            });

            return post;
        } catch (error) {
            logger.error('Failed to process transaction', {
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
                blockHeight: tx.blockHeight
            });

            // Save to ProcessedTransaction table
            const savedTx = await this.withFreshClient(async (client) => {
                // Check if transaction already exists
                const existingTx = await client.processedTransaction.findUnique({
                    where: { txid: tx.txid }
                });

                if (existingTx) {
                    // Update existing transaction
                    return await client.processedTransaction.update({
                        where: { txid: tx.txid },
                        data: {
                            type: tx.type,
                            protocol: tx.protocol,
                            blockHeight: tx.blockHeight || 0,
                            blockTime: tx.blockTime || 0,
                            metadata: tx.metadata || {}
                        }
                    });
                } else {
                    // Create new transaction
                    return await client.processedTransaction.create({
                        data: {
                            txid: tx.txid,
                            type: tx.type,
                            protocol: tx.protocol,
                            blockHeight: tx.blockHeight || 0,
                            blockTime: tx.blockTime || 0,
                            metadata: tx.metadata || {}
                        }
                    });
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

    private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (this.shouldRetry(error)) {
                    logger.warn('Database operation failed, retrying', {
                        attempt,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
                    continue;
                }
                throw error;
            }
        }
        throw lastError || new Error('Operation failed after retries');
    }

    private shouldRetry(error: unknown): boolean {
        const dbError = error as DbError;
        // Retry on connection errors or deadlocks
        return dbError.code === '40001' || // serialization failure
               dbError.code === '40P01' || // deadlock
               dbError.code === '57P01';   // connection lost
    }

    private createBlockTimeDate(blockTime?: number | bigint): Date {
        const now = new Date();
        if (!blockTime) {
            return now;
        }

        try {
            // Convert to milliseconds
            const timestampMs = Number(BigInt(blockTime) * BigInt(1000));
            
            // Check if timestamp is reasonable (between 2020 and 2050)
            const minTimestamp = new Date('2020-01-01').getTime();
            const maxTimestamp = new Date('2050-01-01').getTime();
            
            if (timestampMs < minTimestamp || timestampMs > maxTimestamp) {
                logger.warn('Invalid block time detected, using current time', {
                    blockTime,
                    timestampMs
                });
                return now;
            }

            return new Date(timestampMs);
        } catch (error) {
            logger.error('Error converting block time', {
                blockTime,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return now;
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

    async getTransaction(txid: string): Promise<ParsedTransaction | null> {
        try {
            const [transaction] = await prisma.$queryRaw<Array<{
                txid: string;
                type: string;
                protocol: string;
                blockHeight: number;
                blockTime: bigint;
                metadata: any;
            }>>`
                SELECT txid, type, protocol, "blockHeight", "blockTime", metadata
                FROM "ProcessedTransaction"
                WHERE txid = ${txid}
                LIMIT 1
            `;

            if (!transaction) {
                return null;
            }

            return {
                txid: transaction.txid,
                type: transaction.type,
                protocol: transaction.protocol,
                blockHeight: transaction.blockHeight,
                blockTime: Number(transaction.blockTime),
                metadata: transaction.metadata
            };
        } catch (error) {
            logger.error('Error in getTransaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid
            });
            return null;
        }
    }

    public async getPostWithVoteOptions(postId: string): Promise<PostWithVoteOptions | null> {
        return await prisma.post.findUnique({
            where: { postId: postId },
            include: {
                voteOptions: true,
                voteQuestion: true,
                lockLikes: true
            }
        });
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withRetry(async () => {
            await prisma.voteOption.deleteMany();
            await prisma.voteQuestion.deleteMany();
            await prisma.lockLike.deleteMany();
            await prisma.post.deleteMany();
            await prisma.processedTransaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }

    /**
     * Get the current blockchain height from the database
     * @returns The current block height or null if not available
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        try {
            logger.debug('Getting current block height');
            
            // Try to get the latest block height from the blockchain_state table
            const blockchainState = await prisma.blockchain_state.findFirst({
                orderBy: {
                    updatedAt: 'desc'
                }
            });
            
            if (blockchainState?.currentHeight) {
                logger.debug(`Found current block height: ${blockchainState.currentHeight}`);
                return blockchainState.currentHeight;
            }
            
            // If no blockchain_state record, try to get the height from the latest transaction
            const latestTx = await prisma.transaction.findFirst({
                orderBy: {
                    blockHeight: 'desc'
                },
                where: {
                    blockHeight: {
                        not: null
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

    async verifyDatabaseContents(txid: string, testOutputDir: string) {
        // Get the processed transaction
        const processedTx = await this.getTransaction(txid);
        if (!processedTx) {
            throw new Error(`No processed transaction found for txid ${txid}`);
        }

        const metadata = processedTx.metadata as ProcessedTxMetadata;

        // Get the post with vote data
        const post = await this.getPostWithVoteOptions(metadata.postId);
        if (!post) {
            throw new Error(`No post found for postId ${metadata.postId}`);
        }

        // Prepare verification results
        const results = {
            hasPost: true,
            hasImage: !!post.image,
            hasVoteQuestion: post.voteQuestion !== null,
            voteOptionsCount: post.voteOptions?.length || 0,
            hasLockLikes: post.lockLikes?.length > 0 || false,
            txid,
            postId: post.postId,
            contentType: post.image ? 'Image + Text' : 'Text Only',
            voteQuestion: post.voteQuestion ? {
                question: post.voteQuestion.question,
                totalOptions: post.voteQuestion.totalOptions,
                optionsHash: post.voteQuestion.optionsHash
            } : undefined,
            voteOptions: post.voteOptions?.map(opt => ({
                content: opt.text,
                index: opt.optionIndex
            })).sort((a, b) => a.index - b.index)
        };

        // Log verification results
        logger.info('Database verification results', results);

        // Save image if present
        if (post.image) {
            const ext = (metadata.imageMetadata?.contentType?.split('/')[1] || 'jpg');
            const imagePath = path.join(testOutputDir, `${txid}_image.${ext}`);
            await fs.promises.writeFile(imagePath, post.image);
            logger.info('Saved image to file', { path: imagePath });
        }

        // Write verification results to file
        const outputPath = path.join(testOutputDir, `${txid}_verification.txt`);
        const outputContent = [
            `Transaction ID: ${txid}`,
            `Post ID: ${post.postId}`,
            `Content Type: ${results.contentType}`,
            `Block Time: ${post.blockTime.toISOString()}`,
            `Sender Address: ${post.authorAddress || 'Not specified'}`,
            '\nContent:',
            post.content,
            '\nTransaction Details:',
            `- Has Image: ${results.hasImage}`,
            `- Has Vote Question: ${results.hasVoteQuestion}`,
            `- Vote Options Count: ${results.voteOptionsCount}`,
            `- Has Lock Likes: ${results.hasLockLikes}`,
            results.hasImage ? [
                '\nImage Metadata:',
                `- Content Type: ${metadata.imageMetadata?.contentType || 'Not specified'}`,
                `- Filename: ${metadata.imageMetadata?.filename || 'Not specified'}`,
                `- Size: ${metadata.imageMetadata?.size || 'Not specified'}`,
                `- Dimensions: ${metadata.imageMetadata?.width || '?'}x${metadata.imageMetadata?.height || '?'}`
            ].join('\n') : '',
            results.hasVoteQuestion ? [
                '\nVote Details:',
                `Question: ${post.voteQuestion?.question}`,
                `Total Options: ${post.voteQuestion?.totalOptions}`,
                `Options Hash: ${post.voteQuestion?.optionsHash}`,
                '\nVote Options:',
                ...post.voteOptions
                    .sort((a, b) => a.optionIndex - b.optionIndex)
                    .map((opt, i) => `${i + 1}. ${opt.text} (Index: ${opt.optionIndex})`)
            ].join('\n') : '\nNo Vote Data'
        ].join('\n');

        await fs.promises.writeFile(outputPath, outputContent);
        logger.info('Saved verification results to', { path: outputPath });

        return results;
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
}