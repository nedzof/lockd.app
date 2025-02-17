import { PrismaClient } from '@prisma/client';
import { ParsedPost } from '../parser/types';

export class TransactionProcessor {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async processBatch(posts: ParsedPost[]): Promise<void> {
        try {
            for (const post of posts) {
                await this.processPost(post);
            }
        } catch (error) {
            console.error('Error processing batch:', error);
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    }

    private async processPost(post: ParsedPost): Promise<void> {
        try {
            // Create or update the post
            const upsertedPost = await this.prisma.post.upsert({
                where: { postId: post.postId },
                create: {
                    postId: post.postId,
                    type: post.type,
                    content: post.content,
                    timestamp: new Date(post.timestamp),
                    sequence: post.sequence,
                    parentSequence: post.parentSequence
                },
                update: {
                    type: post.type,
                    content: post.content,
                    timestamp: new Date(post.timestamp),
                    sequence: post.sequence,
                    parentSequence: post.parentSequence
                }
            });

            // If this is a vote question, create or update the voting data
            if (post.votingData) {
                await this.prisma.voteQuestion.upsert({
                    where: { postId: post.postId },
                    create: {
                        postId: post.postId,
                        question: post.votingData.question,
                        totalOptions: post.votingData.metadata.totalOptions,
                        optionsHash: post.votingData.metadata.optionsHash,
                        protocol: post.votingData.metadata.protocol
                    },
                    update: {
                        question: post.votingData.question,
                        totalOptions: post.votingData.metadata.totalOptions,
                        optionsHash: post.votingData.metadata.optionsHash,
                        protocol: post.votingData.metadata.protocol
                    }
                });

                // Create or update vote options if they exist
                for (const option of post.votingData.options) {
                    await this.prisma.voteOption.upsert({
                        where: {
                            postId_index: {
                                postId: post.postId,
                                index: option.index
                            }
                        },
                        create: {
                            postId: post.postId,
                            index: option.index,
                            content: option.content,
                            lockAmount: option.lockAmount,
                            lockDuration: option.lockDuration
                        },
                        update: {
                            content: option.content,
                            lockAmount: option.lockAmount,
                            lockDuration: option.lockDuration
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error processing post:', error);
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    }
}
