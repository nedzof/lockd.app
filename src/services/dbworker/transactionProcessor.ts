import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { BasePost, VotePost, TransactionEvent, SavedTransactionData, DBError } from '../common/types';

export class DBTransactionProcessor extends EventEmitter {
    private prisma: PrismaClient;

    constructor() {
        super();
        this.prisma = new PrismaClient();

        // Listen for parsed transactions
        this.on('transaction', async (event: TransactionEvent) => {
            if (event.type === 'TRANSACTION_PARSED' && event.data) {
                const { post } = event.data as any;
                try {
                    const result = await this.processPost(post);
                    this.emit('transaction', {
                        type: 'TRANSACTION_SAVED',
                        data: { post: result },
                        timestamp: new Date()
                    } as TransactionEvent);
                } catch (error) {
                    this.emit('error', error);
                }
            }
        });
    }

    async processPost(post: BasePost): Promise<any> {
        try {
            // Handle vote posts
            if ('votingData' in post) {
                return await this.processVotePost(post as VotePost);
            }

            // Handle regular posts
            return await this.prisma.post.create({
                data: {
                    postId: post.id,
                    type: post.type,
                    content: post.content,
                    timestamp: new Date(post.metadata.timestamp || Date.now()),
                    sequence: parseInt(post.metadata.sequence || '0'),
                    parentSequence: parseInt(post.metadata.parentSequence || '0')
                }
            });
        } catch (error) {
            const dbError = new DBError(
                'Error processing post',
                'create',
                'Post',
                error instanceof Error ? error : undefined
            );
            this.emit('error', dbError);
            throw dbError;
        }
    }

    private async processVotePost(post: VotePost): Promise<any> {
        try {
            // Create the base post first
            const result = await this.prisma.post.create({
                data: {
                    postId: post.id,
                    type: post.type,
                    content: post.content,
                    timestamp: new Date(post.metadata.timestamp || Date.now()),
                    sequence: parseInt(post.metadata.sequence || '0'),
                    parentSequence: parseInt(post.metadata.parentSequence || '0'),
                    voteQuestion: {
                        create: {
                            question: post.votingData.question,
                            totalOptions: post.votingData.options.length,
                            optionsHash: post.metadata.optionsHash || '',
                            protocol: post.metadata.protocol || 'MAP',
                            voteOptions: {
                                create: post.votingData.options.map(option => ({
                                    index: option.index,
                                    content: option.content,
                                    lockAmount: option.lockAmount,
                                    lockDuration: option.lockDuration,
                                    postId: post.id
                                }))
                            }
                        }
                    }
                },
                include: {
                    voteQuestion: {
                        include: {
                            voteOptions: true
                        }
                    }
                }
            });

            return result;
        } catch (error) {
            const dbError = new DBError(
                'Error processing vote post',
                'create',
                'VotePost',
                error instanceof Error ? error : undefined
            );
            this.emit('error', dbError);
            throw dbError;
        }
    }

    async processBatch(posts: BasePost[]): Promise<(any)[]> {
        const results: (any)[] = [];

        for (const post of posts) {
            try {
                const result = await this.processPost(post);
                results.push(result);
            } catch (error) {
                this.emit('error', error);
            }
        }

        return results;
    }

    async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }
}
