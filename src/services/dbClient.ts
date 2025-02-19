import { PrismaClient, Prisma } from '@prisma/client';
import { ParsedTransaction } from './types';
import { logger } from '../utils/logger';

interface VoteQuestion {
    id: string;
    postId: string;
    question: string;
    totalOptions: number;
    optionsHash: string;
}

interface VoteOption {
    id: string;
    postId: string;
    voteQuestionId: string;
    index: number;
    content: string;
}

interface LockLike {
    id: string;
    txid: string;
    postId: string;
    voteOptionId: string;
    lockAmount: number;
    lockDuration: number;
    isProcessed: boolean;
}

interface Post {
    id: string;
    postId: string;
    type: string;
    content: Prisma.JsonValue;
    blockTime: Date;
    sequence: number;
    parentSequence: number;
}

interface ProcessedTransaction {
    id: string;
    txid: string;
    blockHeight: number;
    blockTime: Date;
}

export class DBClient {
    private prisma: PrismaClient;
    private static instanceCount = 0;
    private instanceId: number;

    constructor() {
        DBClient.instanceCount++;
        this.instanceId = DBClient.instanceCount;
        logger.info(`Creating new DBClient instance`, { instanceId: this.instanceId });

        this.prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
            datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1"
        });

        logger.info(`PrismaClient initialized`, { instanceId: this.instanceId });
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

            for (const transaction of transactions) {
                switch (transaction.type) {
                    case 'content':
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
                        break;
                    case 'question':
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
                        break;
                    case 'vote':
                        // First find the question
                        const question = await this.prisma.voteQuestion.findUnique({
                            where: {
                                postId: transaction.metadata.postId
                            }
                        });

                        if (!question) {
                            throw new Error('Vote question not found');
                        }

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
                        break;
                    default:
                        logger.warn('Unknown transaction type', { type: transaction.type });
                }
            }
        } catch (error) {
            logger.error('Error processing transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                txid: Array.isArray(tx) ? tx[0]?.txid : tx.txid
            });
            throw error;
        }
    }

    async saveTransaction(transaction: ParsedTransaction): Promise<void> {
        const { txid, type, blockHeight, blockTime, metadata, senderAddress } = transaction;

        try {
            // First check if we've already processed this transaction
            const existing = await this.prisma.processedTransaction.findUnique({
                where: { txid }
            });

            if (existing) {
                logger.info('Transaction already processed, skipping', {
                    txid,
                    blockHeight,
                    instanceId: this.instanceId
                });
                return;
            }

            logger.info('Starting transaction save', {
                txid,
                type,
                blockHeight,
                instanceId: this.instanceId
            });

            await this.prisma.$transaction(async (prisma) => {
                // Create the processed transaction record
                await prisma.processedTransaction.create({
                    data: {
                        txid,
                        blockHeight,
                        blockTime: blockTime ? new Date(blockTime * 1000) : new Date()
                    }
                });

                logger.debug('Created processed transaction record', { txid });

                // Create the post
                const post = await prisma.post.create({
                    data: {
                        postId: metadata.postId,
                        type: type,
                        protocol: 'MAP',
                        content: metadata.content,
                        senderAddress: senderAddress,
                        blockTime: blockTime ? new Date(blockTime * 1000) : new Date(),
                        sequence: metadata.sequence || 0,
                        parentSequence: metadata.parentSequence || 0
                    }
                });

                logger.debug('Created post record', {
                    txid,
                    postId: metadata.postId,
                    type
                });

                // Handle specific post types
                switch (type) {
                    case 'question':
                        await prisma.voteQuestion.create({
                            data: {
                                postId: metadata.postId,
                                question: metadata.content as string,
                                totalOptions: 0,
                                optionsHash: '',
                                post: {
                                    connect: {
                                        postId: metadata.postId
                                    }
                                }
                            }
                        });
                        logger.debug('Created vote question', {
                            txid,
                            postId: metadata.postId
                        });
                        break;

                    case 'vote':
                        const question = await prisma.voteQuestion.findUnique({
                            where: {
                                postId: metadata.postId
                            }
                        });

                        if (!question) {
                            throw new Error(`Vote question not found for postId: ${metadata.postId}`);
                        }

                        await prisma.voteOption.create({
                            data: {
                                postId: metadata.postId,
                                content: metadata.content as string,
                                index: 0,
                                post: {
                                    connect: {
                                        postId: metadata.postId
                                    }
                                },
                                voteQuestion: {
                                    connect: {
                                        id: question.id
                                    }
                                }
                            }
                        });
                        logger.debug('Created vote option', {
                            txid,
                            postId: metadata.postId,
                            questionId: question.id
                        });
                        break;
                }
            });

            logger.info('Successfully saved transaction', {
                txid,
                type,
                blockHeight,
                instanceId: this.instanceId
            });
        } catch (error) {
            logger.error('Error saving transaction', {
                txid,
                type,
                blockHeight,
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
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

    async insertTransactions(transactions: ParsedTransaction[]) {
        return await this.prisma.$transaction(async (tx) => {
            // Filter existing txids first
            const txids = transactions.map(t => t.txid);
            const existing = await tx.processedTransaction.findMany({
                where: { txid: { in: txids } },
                select: { txid: true }
            });

            const newTxids = txids.filter(id => 
                !existing.some(e => e.txid === id)
            );

            if (newTxids.length === 0) {
                logger.info('All transactions already processed', {
                    count: transactions.length
                });
                return;
            }

            // Batch insert transactions with error handling
            await tx.processedTransaction.createMany({
                data: newTxids.map(txid => {
                    const transaction = transactions.find(t => t.txid === txid)!;
                    return {
                        txid,
                        blockHeight: transaction.blockHeight,
                        blockTime: transaction.blockTime 
                            ? new Date(transaction.blockTime * 1000)
                            : new Date()
                    };
                }),
                skipDuplicates: true
            });

            // Insert posts with upsert
            for (const t of transactions) {
                if (!newTxids.includes(t.txid)) continue;

                await tx.post.upsert({
                    where: { postId: t.metadata.postId },
                    update: {
                        content: t.metadata.content,
                        updatedAt: new Date()
                    },
                    create: {
                        postId: t.metadata.postId,
                        type: t.type,
                        content: t.metadata.content,
                        protocol: t.metadata.protocol || 'MAP',
                        blockTime: t.blockTime 
                            ? new Date(t.blockTime * 1000)
                            : new Date(),
                        sequence: 0,
                        parentSequence: 0
                    }
                });
            }

            logger.info('Successfully inserted transactions and posts', {
                newTransactions: newTxids.length,
                totalTransactions: transactions.length
            });
        });
    }

    private chunk(arr: any[], size: number): any[][] {
        return Array(Math.ceil(arr.length / size)).fill().map((_, index) => arr.slice(index * size, (index + 1) * size));
    }
}