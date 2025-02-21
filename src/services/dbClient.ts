import { PrismaClient } from '@prisma/client';
import { ParsedTransaction, Post, DbError } from '../shared/types';
import { logger } from '../utils/logger';

interface ParsedTransaction {
    txid: string;
    type: string;
    blockHeight?: number;
    blockTime?: number;
    senderAddress?: string;
    metadata: {
        postId: string;
        content: string;
        protocol?: string;
        lockAmount?: number;
        lockDuration?: number;
    };
}

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
            datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1"
        });

        // Set up Prisma error logging
        this.prisma.$on('error', (e) => {
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

    async connect() {
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

    async disconnect() {
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

    async isConnected() {
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

    async processTransaction(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                txids: transactions.map(t => t.txid)
            });

            for (const transaction of transactions) {
                logger.debug('Processing single transaction', {
                    txid: transaction.txid,
                    type: transaction.type,
                    protocol: transaction.protocol,
                    blockHeight: transaction.blockHeight,
                    hasContent: !!transaction.content,
                    hasVoteOption: !!transaction.voteOption,
                    hasVoteQuestion: !!transaction.voteQuestion,
                    hasLockLike: !!transaction.lockLike
                });

                try {
                    // First save the raw transaction
                    await this.prisma.processedTransaction.create({
                        data: {
                            txid: transaction.txid,
                            type: transaction.type,
                            protocol: transaction.protocol || 'unknown',
                            blockHeight: transaction.blockHeight,
                            blockTime: transaction.blockTime ? new Date(transaction.blockTime * 1000) : new Date(),
                            content: transaction.content || {},
                            lockAmount: transaction.lockLike?.lockAmount,
                            lockDuration: transaction.lockLike?.lockDuration
                        }
                    });

                    logger.info('Transaction saved to ProcessedTransaction', {
                        txid: transaction.txid,
                        type: transaction.type,
                        protocol: transaction.protocol
                    });

                    // Then process specific transaction types
                    switch (transaction.type) {
                        case 'content':
                            logger.debug('Creating content post', {
                                txid: transaction.txid,
                                postId: transaction.metadata?.postId,
                                contentLength: transaction.metadata?.content?.length || 0
                            });

                            await this.prisma.post.create({
                                data: {
                                    postId: transaction.metadata.postId,
                                    type: transaction.type,
                                    content: transaction.metadata.content,
                                    blockTime: transaction.blockTime ? new Date(transaction.blockTime * 1000) : new Date(),
                                    sequence: transaction.metadata.sequence || 0,
                                    parentSequence: transaction.metadata.parentSequence || 0
                                }
                            });

                            logger.info('Content post created successfully', {
                                txid: transaction.txid,
                                postId: transaction.metadata.postId
                            });
                            break;

                        case 'question':
                            logger.debug('Creating vote question', {
                                txid: transaction.txid,
                                postId: transaction.metadata?.postId,
                                questionLength: transaction.metadata?.content?.length || 0
                            });

                            await this.prisma.voteQuestion.create({
                                data: {
                                    postId: transaction.metadata.postId,
                                    question: transaction.metadata.content,
                                    totalOptions: 0,
                                    optionsHash: '',
                                    post: {
                                        connect: {
                                            postId: transaction.metadata.postId
                                        }
                                    }
                                }
                            });

                            logger.info('Vote question created successfully', {
                                txid: transaction.txid,
                                postId: transaction.metadata.postId
                            });
                            break;

                        case 'vote':
                            logger.debug('Processing vote option', {
                                txid: transaction.txid,
                                postId: transaction.metadata?.postId
                            });

                            // First find the question
                            const question = await this.prisma.voteQuestion.findUnique({
                                where: {
                                    postId: transaction.metadata.postId
                                }
                            });

                            if (!question) {
                                logger.error('Vote question not found', {
                                    txid: transaction.txid,
                                    postId: transaction.metadata.postId
                                });
                                throw new Error('Vote question not found');
                            }

                            logger.debug('Found associated question', {
                                txid: transaction.txid,
                                questionId: question.id,
                                postId: transaction.metadata.postId
                            });

                            await this.prisma.voteOption.create({
                                data: {
                                    postId: transaction.metadata.postId,
                                    content: transaction.metadata.content,
                                    index: 0,
                                    post: {
                                        connect: {
                                            postId: transaction.metadata.postId
                                        }
                                    },
                                    voteQuestion: {
                                        connect: {
                                            id: question.id
                                        }
                                    }
                                }
                            });

                            logger.info('Vote option created successfully', {
                                txid: transaction.txid,
                                postId: transaction.metadata.postId,
                                questionId: question.id
                            });
                            break;

                        case 'lock':
                            logger.debug('Processing lock transaction', {
                                txid: transaction.txid,
                                lockAmount: transaction.lockLike?.lockAmount,
                                lockDuration: transaction.lockLike?.lockDuration
                            });

                            await this.prisma.processedTransaction.create({
                                data: {
                                    txid: transaction.txid,
                                    type: transaction.type,
                                    protocol: transaction.protocol,
                                    blockHeight: transaction.blockHeight,
                                    blockTime: transaction.blockTime,
                                    content: transaction.content,
                                    lockAmount: transaction.lockLike?.lockAmount,
                                    lockDuration: transaction.lockLike?.lockDuration
                                }
                            });

                            logger.info('Lock transaction processed successfully', {
                                txid: transaction.txid
                            });
                            break;

                        case 'unlock':
                            logger.debug('Processing unlock transaction', {
                                txid: transaction.txid
                            });

                            await this.prisma.processedTransaction.create({
                                data: {
                                    txid: transaction.txid,
                                    type: transaction.type,
                                    protocol: transaction.protocol,
                                    blockHeight: transaction.blockHeight,
                                    blockTime: transaction.blockTime,
                                    content: transaction.content
                                }
                            });

                            logger.info('Unlock transaction processed successfully', {
                                txid: transaction.txid
                            });
                            break;

                        default:
                            logger.warn('Unknown transaction type', {
                                txid: transaction.txid,
                                type: transaction.type,
                                protocol: transaction.protocol
                            });
                    }
                } catch (error) {
                    logger.error('Error processing single transaction', {
                        txid: transaction.txid,
                        type: transaction.type,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Error in batch transaction processing', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                txCount: Array.isArray(tx) ? tx.length : 1,
                firstTxid: Array.isArray(tx) ? tx[0]?.txid : tx.txid
            });
            throw error;
        }
    }

    async saveTransaction(transaction: ParsedTransaction): Promise<void> {
        await this.withRetry(async () => {
            try {
                // Convert blockTime to Date, handling both seconds and milliseconds
                let blockTime = new Date();
                if (transaction.blockTime) {
                    // If blockTime is in seconds (less than year 2000), multiply by 1000
                    const timestamp = transaction.blockTime < 946684800000 
                        ? transaction.blockTime * 1000 
                        : transaction.blockTime;
                    blockTime = new Date(timestamp);
                }

                // Create or update post
                const post = await this.prisma.post.upsert({
                    where: {
                        postId: transaction.metadata.postId
                    },
                    create: {
                        postId: transaction.metadata.postId,
                        type: transaction.type || 'unknown',
                        content: transaction.metadata.content,
                        blockTime,
                        sequence: 0,
                        parentSequence: 0,
                        protocol: transaction.protocol || 'MAP',
                        senderAddress: transaction.senderAddress || 'unknown',
                        blockHeight: transaction.blockHeight || null,
                        txid: transaction.txid
                    },
                    update: {
                        content: transaction.metadata.content,
                        blockTime,
                        protocol: transaction.protocol || 'MAP',
                        senderAddress: transaction.senderAddress || 'unknown',
                        blockHeight: transaction.blockHeight || null,
                        txid: transaction.txid
                    }
                });

                // Handle lock/unlock actions
                if (transaction.type === 'lock') {
                    const lockAmount = transaction.metadata.lockAmount || 0;
                    const lockDuration = transaction.metadata.lockDuration || 0;

                    await this.prisma.lockLike.create({
                        data: {
                            postId: post.id,
                            txid: transaction.txid,
                            lockAmount,
                            lockDuration,
                            createdAt: blockTime
                        }
                    });
                }

                // Record processed transaction
                await this.prisma.processedTransaction.create({
                    data: {
                        txid: transaction.txid,
                        blockHeight: transaction.blockHeight || 0,
                        blockTime,
                        protocol: transaction.protocol || 'MAP',
                        type: transaction.type || 'unknown',
                        content: transaction.metadata.content,
                        lockAmount: transaction.metadata.lockAmount || null,
                        lockDuration: transaction.metadata.lockDuration || null
                    }
                });
            } catch (error) {
                if ((error as DbError).code === '23505') { // Unique violation
                    logger.warn('Duplicate transaction detected', { txid: transaction.txid });
                    return; // Skip duplicates silently
                }
                throw error;
            }
        });
    }

    async getPost(postId: string): Promise<Post | null> {
        try {
            return await this.prisma.post.findUnique({
                where: {
                    postId: postId
                }
            });
        } catch (error) {
            logger.error(`Error in getPost:`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async updatePost(postId: string, content: string): Promise<Post> {
        try {
            return await this.prisma.post.update({
                where: {
                    postId: postId
                },
                data: {
                    content: { text: content }
                }
            });
        } catch (error) {
            logger.error(`Error in updatePost:`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async insertTransactions(transactions: ParsedTransaction[]): Promise<void> {
        if (!transactions.length) return;

        try {
            // Use a transaction to ensure atomic batch insert
            await this.prisma.$transaction(async (tx) => {
                for (const transaction of transactions) {
                    await this.insertSingleTransaction(tx, transaction);
                }
            });

            logger.info('Successfully inserted batch of transactions', {
                count: transactions.length
            });
        } catch (error) {
            logger.error('Failed to insert transaction batch', {
                count: transactions.length,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async insertSingleTransaction(
        tx: any,
        transaction: ParsedTransaction
    ): Promise<void> {
        try {
            const result = await tx.processedTransaction.upsert({
                where: {
                    txid: transaction.txid
                },
                create: {
                    txid: transaction.txid,
                    blockHeight: transaction.blockHeight,
                    blockTime: transaction.blockTime,
                    senderAddress: transaction.senderAddress,
                    postId: transaction.metadata.postId,
                    content: transaction.metadata.content,
                    protocol: transaction.metadata.protocol,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                update: {
                    // Only update if the block info was missing before
                    blockHeight: transaction.blockHeight 
                        ? { set: transaction.blockHeight }
                        : undefined,
                    blockTime: transaction.blockTime
                        ? { set: transaction.blockTime }
                        : undefined,
                    updatedAt: new Date()
                }
            });

            logger.debug('Transaction processed', {
                txid: transaction.txid,
                operation: result ? 'updated' : 'created'
            });
        } catch (error) {
            logger.error('Failed to process transaction', {
                txid: transaction.txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    async getTransaction(txid: string): Promise<ParsedTransaction | null> {
        try {
            const transaction = await this.prisma.processedTransaction.findUnique({
                where: { txid }
            });

            if (!transaction) return null;

            return {
                txid: transaction.txid,
                type: transaction.type,
                blockHeight: transaction.blockHeight || undefined,
                blockTime: transaction.blockTime || undefined,
                senderAddress: transaction.senderAddress || undefined,
                metadata: {
                    postId: transaction.postId,
                    content: transaction.content,
                    protocol: transaction.protocol || undefined
                }
            };
        } catch (error) {
            logger.error('Failed to get transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private chunk(arr: any[], size: number): any[][] {
        return Array(Math.ceil(arr.length / size)).fill().map((_, index) => arr.slice(index * size, (index + 1) * size));
    }
}