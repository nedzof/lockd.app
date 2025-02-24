import { PrismaClient, Prisma, Post, VoteOption, VoteQuestion, LockLike } from '@prisma/client';
import { Post as SharedPost, ParsedTransaction, DbError, PostWithVoteOptions, ProcessedTxMetadata } from '../shared/types.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class DbClient {
    private prisma: PrismaClient;
    private static instanceCount = 0;
    private instanceId: number;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    constructor() {
        DbClient.instanceCount++;
        this.instanceId = DbClient.instanceCount;
        logger.info(`Creating new DbClient instance`, { instanceId: this.instanceId });

        this.prisma = new PrismaClient({
            log: [
                { level: 'warn', emit: 'event' },
                { level: 'error', emit: 'event' }
            ],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL + "?pgbouncer=true&pool_timeout=30&connection_limit=10"
                }
            }
        });

        // Set up Prisma error logging
        (this.prisma as any).$on('error', (e: { message: string; target?: string }) => {
            logger.error('Prisma client error:', {
                error: e.message,
                target: e.target
            });
        });

        logger.info(`PrismaClient initialized`, { instanceId: this.instanceId });
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

    async connect(): Promise<boolean> {
        logger.info(`Connecting to database`, { instanceId: this.instanceId });
        try {
            await this.prisma.$connect();
            logger.info(`Successfully connected to database`, { instanceId: this.instanceId });
            return true;
        } catch (error) {
            logger.error(`Failed to connect to database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            return false;
        }
    }

    async disconnect(): Promise<void> {
        logger.info(`Disconnecting from database`, { instanceId: this.instanceId });
        try {
            await this.prisma.$disconnect();
            logger.info(`Successfully disconnected from database`, { instanceId: this.instanceId });
        } catch (error) {
            logger.error(`Error disconnecting from database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async isConnected(): Promise<boolean> {
        logger.debug(`Checking database connection`, { instanceId: this.instanceId });
        try {
            await this.prisma.$queryRaw`SELECT 1`;
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

    async processTransaction(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                txids: transactions.map(t => t.txid)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.saveTransaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.saveTransaction(t)));
            }
        } catch (error) {
            logger.error('Error in processTransaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    public async saveTransaction(tx: ParsedTransaction): Promise<void> {
        logger.info('💾 About to save transaction to database', { 
            txid: tx.txid,
            hasImage: !!tx.metadata.image,
            imageType: tx.metadata.imageMetadata?.contentType
        });

        try {
            // Ensure we have metadata
            tx.metadata = tx.metadata || {};
            
            // Generate postId if missing
            if (!tx.metadata.postId && tx.txid) {
                // Use the frontend's format: timestamp-random
                const timestamp = Date.now().toString(36);
                const random = Math.random().toString(36).substr(2, 9);
                tx.metadata.postId = [timestamp, random].join('-').substr(0, 32);
                
                logger.info('Generated postId for transaction', { 
                    txid: tx.txid, 
                    generatedPostId: tx.metadata.postId 
                });
            }

            // Validate required fields
            if (!tx.metadata.postId) {
                throw new Error('Transaction must have either a postId or txid');
            }

            // Handle image buffer
            let imageBuffer = null;
            if (tx.metadata.image) {
                // Ensure we have a proper Buffer
                imageBuffer = Buffer.isBuffer(tx.metadata.image) 
                    ? tx.metadata.image 
                    : Buffer.from(tx.metadata.image);
                
                logger.debug('📸 Processing image buffer', {
                    bufferLength: imageBuffer.length,
                    contentType: tx.metadata.imageMetadata?.contentType
                });
            }

            const postData = {
                postId: tx.metadata.postId,
                type: tx.type,
                content: tx.metadata.content,
                blockTime: new Date(Number(tx.blockTime)),
                sequence: tx.sequence || 0,
                parentSequence: tx.parentSequence || 0,
                protocol: tx.protocol,
                senderAddress: tx.senderAddress || null,
                txid: tx.txid || null,
                image: imageBuffer
            };

            logger.debug('Pre-upsert transaction validation:', {
                txid: tx.txid,
                postId: tx.metadata?.postId,
                type: tx.type,
                hasMetadata: !!tx.metadata,
                metadataKeys: tx.metadata ? Object.keys(tx.metadata) : [],
                imageBufferSize: imageBuffer?.length
            });

            // Check if post exists first
            try {
                const exists = await this.prisma.post.findUnique({
                    where: { postId: tx.metadata.postId }
                });
                logger.debug('Post lookup result:', { 
                    postId: tx.metadata.postId,
                    exists: !!exists,
                    operation: exists ? 'update' : 'create'
                });
            } catch (e) {
                logger.error('Post lookup failed:', {
                    error: e instanceof Error ? e.message : 'Unknown error',
                    postId: tx.metadata.postId
                });
            }

            // Use upsert instead of create
            const post = await this.prisma.post.upsert({
                where: {
                    postId: tx.metadata.postId // Use postId as the unique identifier
                },
                create: postData,
                update: {
                    ...postData,
                    // Only update image if new image data is provided
                    ...(imageBuffer ? {
                        image: imageBuffer
                    } : {})
                }
            });

            const action = post.createdAt === post.updatedAt ? 'created' : 'updated';
            logger.info(`✅ Post ${action} successfully`, {
                postId: post.postId,
                txid: post.txid,
                hasImage: !!imageBuffer,
                imageSize: imageBuffer?.length,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt
            });

            // Handle lock likes
            if (tx.type === 'lock') {
                // First check if a lock like exists for this txid
                const existingLock = await this.prisma.lockLike.findFirst({
                    where: {
                        txid: tx.txid
                    }
                });

                if (!existingLock) {
                    // Create new lock like if it doesn't exist
                    await this.prisma.lockLike.create({
                        data: {
                            postId: post.id,
                            txid: tx.txid,
                            lockAmount: tx.metadata.lockAmount || 0,
                            lockDuration: tx.metadata.lockDuration || 0
                        }
                    });

                    logger.debug('✅ Lock like created', {
                        postId: post.postId,
                        txid: tx.txid,
                        lockAmount: tx.metadata.lockAmount
                    });
                } else {
                    // Update existing lock like
                    await this.prisma.lockLike.update({
                        where: {
                            id: existingLock.id
                        },
                        data: {
                            lockAmount: tx.metadata.lockAmount || 0,
                            lockDuration: tx.metadata.lockDuration || 0
                        }
                    });

                    logger.debug('✅ Lock like updated', {
                        postId: post.postId,
                        txid: tx.txid,
                        lockAmount: tx.metadata.lockAmount
                    });
                }
            }

            // Handle vote options if present
            if (tx.metadata.voteOptions && tx.metadata.voteOptions.length > 0) {
                // First create the vote question
                const voteQuestion = await this.prisma.voteQuestion.create({
                    data: {
                        postId: post.postId,
                        question: tx.metadata.voteQuestion || 'Default Question',
                        totalOptions: tx.metadata.voteOptions.length,
                        optionsHash: tx.metadata.optionsHash || '',
                        voteOptions: {
                            create: tx.metadata.voteOptions.map((option, index) => ({
                                postId: post.postId,
                                content: option,
                                index: index
                            }))
                        }
                    }
                });

                logger.debug('✅ Vote options created', {
                    postId: post.postId,
                    questionId: voteQuestion.id,
                    optionsCount: tx.metadata.voteOptions.length
                });
            }

            // Finally create the processed transaction record
            await this.prisma.$executeRaw`
                INSERT INTO "ProcessedTransaction" (
                    "txid", "blockHeight", "blockTime", "protocol", "type", "metadata"
                ) VALUES (
                    ${tx.txid},
                    ${tx.blockHeight || 0},
                    ${BigInt(Math.floor(Number(tx.blockTime)))},
                    ${tx.protocol},
                    ${tx.type},
                    ${JSON.stringify(tx.metadata)}::jsonb
                )
            `;

            logger.info('✅ Transaction saved successfully', { txid: tx.txid });
        } catch (error) {
            logger.error('Error in saveTransaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async getTransaction(txid: string): Promise<ParsedTransaction | null> {
        const [transaction] = await this.prisma.$queryRaw<Array<{
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
    }

    public async getPostWithVoteOptions(postId: string): Promise<PostWithVoteOptions | null> {
        return await this.prisma.post.findUnique({
            where: { postId },
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
            await this.prisma.voteOption.deleteMany();
            await this.prisma.voteQuestion.deleteMany();
            await this.prisma.lockLike.deleteMany();
            await this.prisma.post.deleteMany();
            await this.prisma.processedTransaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }

    // Verify database contents and generate verification files
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
            `Sender Address: ${post.senderAddress || 'Not specified'}`,
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
}