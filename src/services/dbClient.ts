import { PrismaClient, Prisma } from '@prisma/client';
import { ParsedTransaction } from './types';

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
        console.log(`[DBClient ${this.instanceId}] Creating new instance`);
        
        this.prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
            datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1"
        });
        
        console.log(`[DBClient ${this.instanceId}] PrismaClient initialized`);
    }

    async connect() {
        console.log(`[DBClient ${this.instanceId}] Connecting to database`);
        try {
            await this.prisma.$connect();
            console.log(`[DBClient ${this.instanceId}] Successfully connected`);
            return true;
        } catch (error) {
            console.error(`[DBClient ${this.instanceId}] Failed to connect to database:`, error);
            return false;
        }
    }

    async disconnect() {
        console.log(`[DBClient ${this.instanceId}] Disconnecting Prisma client`);
        try {
            await this.prisma.$disconnect();
            console.log(`[DBClient ${this.instanceId}] Successfully disconnected`);
        } catch (error) {
            console.error(`[DBClient ${this.instanceId}] Error disconnecting:`, error);
            throw error;
        }
    }

    async isConnected() {
        console.log(`[DBClient ${this.instanceId}] Checking database connection`);
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            console.log(`[DBClient ${this.instanceId}] Database connection is active`);
            return true;
        } catch (error) {
            console.log(`[DBClient ${this.instanceId}] Database connection is inactive`);
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
                        console.warn('Unknown transaction type', { type: transaction.type });
                }
            }
        } catch (error) {
            console.error('Error processing transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                txid: Array.isArray(tx) ? tx[0]?.txid : tx.txid
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
            console.error(`[DBClient ${this.instanceId}] Error in getPost:`, error);
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
            console.error(`[DBClient ${this.instanceId}] Error in updatePost:`, error);
            throw error;
        }
    }
}