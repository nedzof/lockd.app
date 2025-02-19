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

    async saveTransaction(parsedTx: ParsedTransaction): Promise<void> {
        try {
            console.log(`[DBClient ${this.instanceId}] Starting saveTransaction for ${parsedTx.txid}`);
            
            console.log(`[DBClient ${this.instanceId}] Beginning database transaction`);
            
            // Use Prisma transaction
            await this.prisma.$transaction(async (tx) => {
                console.log(`[DBClient ${this.instanceId}] Creating post record`);
                
                // Create post
                const post = await tx.post.create({
                    data: {
                        postId: parsedTx.postId,
                        type: parsedTx.type,
                        content: parsedTx.content,
                        blockTime: parsedTx.blockTime ? new Date(parsedTx.blockTime * 1000) : new Date(),
                        sequence: parsedTx.sequence,
                        parentSequence: parsedTx.parentSequence
                    }
                });

                if (parsedTx.vote) {
                    console.log(`[DBClient ${this.instanceId}] Creating vote question record`);
                    
                    // Create vote question
                    const voteQuestion = await tx.voteQuestion.create({
                        data: {
                            postId: parsedTx.postId,
                            question: parsedTx.content.question || '',
                            totalOptions: parsedTx.vote.totalOptions,
                            optionsHash: parsedTx.vote.optionsHash
                        }
                    });

                    // Create vote options
                    for (const option of parsedTx.vote.options) {
                        console.log(`[DBClient ${this.instanceId}] Creating vote option record`);
                        
                        const voteOption = await tx.voteOption.create({
                            data: {
                                postId: parsedTx.postId,
                                voteQuestionId: voteQuestion.id,
                                index: option.index,
                                content: ''
                            }
                        });

                        console.log(`[DBClient ${this.instanceId}] Creating lock like record`);
                        
                        // Create lock like
                        await tx.lockLike.create({
                            data: {
                                txid: parsedTx.txid,
                                post: {
                                    connect: {
                                        id: post.id
                                    }
                                },
                                voteOption: {
                                    connect: {
                                        id: voteOption.id
                                    }
                                },
                                lockAmount: option.lockAmount,
                                lockDuration: option.lockDuration,
                                isProcessed: false
                            }
                        });
                    }
                }
            });
            
            console.log(`[DBClient ${this.instanceId}] Successfully saved transaction ${parsedTx.txid}`);
        } catch (error) {
            console.error(`[DBClient ${this.instanceId}] Error in saveTransaction:`, error);
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
                    content: content
                }
            });
        } catch (error) {
            console.error(`[DBClient ${this.instanceId}] Error in updatePost:`, error);
            throw error;
        }
    }
}