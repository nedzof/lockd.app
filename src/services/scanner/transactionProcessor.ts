import { PrismaClient } from '@prisma/client';
import { ParsedPost } from '../parser/types';

const prisma = new PrismaClient();

export class TransactionProcessor {
    async processBatch(posts: ParsedPost[]): Promise<void> {
        for (const post of posts) {
            await this.processTransaction(post);
        }
    }

    async processTransaction(post: ParsedPost): Promise<void> {
        try {
            const currentTime = new Date();
            const currentHeight = 0; // TODO: Get from blockchain

            // Create post
            const createdPost = await prisma.post.create({
                data: {
                    id: post.txid || '',
                    txid: post.txid || '',
                    postId: post.postId,
                    content: post.content,
                    author_address: '',  // TODO: Get from transaction
                    block_height: post.blockHeight || 0,
                    created_at: currentTime,
                    tags: post.tags,
                    is_vote: post.type === 'vote_question'
                }
            });

            // Create vote options if this is a vote post
            if (post.votingData) {
                const voteOptions = post.votingData.options.map(option => ({
                    id: `${post.txid}-${option.index}`,
                    txid: post.txid || '',
                    postId: post.postId,
                    content: option.content,
                    author_address: '',  // TODO: Get from transaction
                    created_at: currentTime,
                    lock_amount: option.lockAmount,
                    lock_duration: option.lockDuration,
                    unlock_height: currentHeight + option.lockDuration,
                    current_height: currentHeight,
                    lock_percentage: 100,  // Default to 100%
                    option_index: option.index,
                    tags: []
                }));

                // Create vote options
                await prisma.voteOption.createMany({
                    data: voteOptions
                });
            }

            console.log('Created post:', createdPost);
        } catch (error) {
            console.error('Failed to process transaction:', error);
            throw error;
        }
    }
}
