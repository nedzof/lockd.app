import { PrismaClient } from '@prisma/client';
import { ProcessedTransaction } from './types.ts';

export class DBClient {
    private prisma: PrismaClient;
    private processedTxids = new Set<string>();

    constructor() {
        this.prisma = new PrismaClient();
    }

    async processTransaction(tx: ProcessedTransaction): Promise<void> {
        // Skip if already processed
        if (this.processedTxids.has(tx.id)) {
            console.log(`Skipping already processed TX ${tx.id}`);
            return;
        }
        this.processedTxids.add(tx.id);

        try {
            await this.prisma.$transaction(async (prisma) => {
                // Create post
                const post = await prisma.post.create({
                    data: {
                        txid: tx.id,
                        protocol: tx.protocol,
                        type: tx.type,
                        postId: tx.postId!,
                        content: tx.content,
                        contentType: tx.contentType,
                        tags: tx.tags || [],
                        blockHeight: tx.blockHeight,
                        blockTime: tx.blockTime,
                        sequence: tx.sequence,
                        parentSequence: tx.parentSequence
                    }
                });

                // Handle vote data if present
                if (tx.vote?.optionsHash) {
                    await prisma.voteQuestion.create({
                        data: {
                            postId: post.id,
                            optionsHash: tx.vote.optionsHash,
                            totalOptions: tx.vote.options?.length || 0
                        }
                    });

                    // Create vote options
                    if (tx.vote.options) {
                        for (const option of tx.vote.options) {
                            await prisma.voteOption.create({
                                data: {
                                    questionId: post.id,
                                    index: option.index,
                                    text: option.text,
                                    value: option.value,
                                    lockAmount: option.lockAmount,
                                    lockDuration: option.lockDuration
                                }
                            });
                        }
                    }
                }

                // Handle lock data if present
                if (tx.lock) {
                    await prisma.lock.create({
                        data: {
                            postId: post.id,
                            amount: tx.lock.amount,
                            duration: tx.lock.duration
                        }
                    });
                }
            });

            console.log(`Successfully processed transaction ${tx.id}`);
        } catch (error) {
            console.error(`Error processing transaction ${tx.id}:`, error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }
}