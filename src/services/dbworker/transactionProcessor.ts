import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { BasePost, VotePost, TransactionEvent, DBError } from '../common/types';
import { DBPost, DBVotePost } from './dbTypes';

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
                        data: result,
                        timestamp: new Date()
                    } as TransactionEvent);
                } catch (error) {
                    this.emit('error', error);
                }
            }
        });
    }

    async processPost(post: BasePost): Promise<DBPost> {
        try {
            // Handle vote posts
            if ('votingData' in post) {
                return await this.processVotePost(post as VotePost);
            }

            // Handle regular posts
            return await this.prisma.post.create({
                data: {
                    id: post.id,
                    type: post.type,
                    content: post.content,
                    metadata: post.metadata
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

    private async processVotePost(post: VotePost): Promise<DBVotePost> {
        try {
            return await this.prisma.votePost.create({
                data: {
                    id: post.id,
                    type: post.type,
                    content: post.content,
                    metadata: post.metadata,
                    question: post.votingData.question,
                    options: {
                        create: post.votingData.options.map(option => ({
                            index: option.index,
                            content: option.content,
                            lockAmount: option.lockAmount,
                            lockDuration: option.lockDuration
                        }))
                    }
                },
                include: {
                    options: true
                }
            });
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

    async processBatch(posts: BasePost[]): Promise<(DBPost | DBVotePost)[]> {
        const results: (DBPost | DBVotePost)[] = [];

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
