import { PrismaClient } from '@prisma/client';
import { ParsedTransaction } from './types';

export class DBClient {
    private prisma: PrismaClient;
    private processedTxids = new Set<string>();

    constructor() {
        this.prisma = new PrismaClient();
    }

    async saveTransaction(parsedTx: ParsedTransaction) {
        if (this.processedTxids.has(parsedTx.txid)) {
            console.log(`Skipping already processed TX ${parsedTx.txid}`);
            return;
        }
        this.processedTxids.add(parsedTx.txid);

        await this.prisma.$transaction(async (tx) => {
            // Save main post
            const post = await tx.post.upsert({
                where: { postId: parsedTx.postId },
                update: {
                    type: parsedTx.vote ? 'vote' : 'content',
                    content: this.transformContent(parsedTx),
                    timestamp: parsedTx.timestamp,
                    sequence: parsedTx.sequence,
                    parentSequence: parsedTx.parentSequence,
                    protocol: 'MAP',
                    blockHeight: parsedTx.blockHeight || 0,
                    blockTime: parsedTx.timestamp || new Date()
                },
                create: {
                    postId: parsedTx.postId,
                    type: parsedTx.vote ? 'vote' : 'content',
                    content: this.transformContent(parsedTx),
                    timestamp: parsedTx.timestamp,
                    sequence: parsedTx.sequence,
                    parentSequence: parsedTx.parentSequence,
                    protocol: 'MAP',
                    blockHeight: parsedTx.blockHeight || 0,
                    blockTime: parsedTx.timestamp || new Date()
                }
            });

            // Process vote data if exists
            if (parsedTx.vote) {
                await tx.voteQuestion.upsert({
                    where: { postId: post.postId },
                    update: {
                        question: this.extractQuestion(parsedTx),
                        totalOptions: parsedTx.vote.totalOptions,
                        optionsHash: parsedTx.vote.optionsHash,
                        protocol: 'MAP'
                    },
                    create: {
                        postId: post.postId,
                        question: this.extractQuestion(parsedTx),
                        totalOptions: parsedTx.vote.totalOptions,
                        optionsHash: parsedTx.vote.optionsHash,
                        protocol: 'MAP',
                        post: { connect: { postId: post.postId } }
                    }
                });

                // Process vote options
                if (parsedTx.vote.options) {
                    for (const option of parsedTx.vote.options) {
                        await tx.voteOption.upsert({
                            where: {
                                postId_index: {
                                    postId: post.postId,
                                    index: option.index
                                }
                            },
                            update: {
                                content: this.findOptionContent(option.index, parsedTx),
                                lockLikes: {
                                    create: this.createLockLike(option, parsedTx)
                                }
                            },
                            create: {
                                postId: post.postId,
                                index: option.index,
                                content: this.findOptionContent(option.index, parsedTx),
                                voteQuestion: { connect: { postId: post.postId } },
                                lockLikes: {
                                    create: this.createLockLike(option, parsedTx)
                                }
                            }
                        });
                    }
                }
            }

            // Process lock likes for non-vote content
            if (!parsedTx.vote && parsedTx.contents.some(c => c.type === 'lock')) {
                await tx.lockLike.create({
                    data: {
                        txid: `${parsedTx.txid}-${Date.now()}`,
                        amount: this.getLockAmount(parsedTx),
                        lockPeriod: this.getLockDuration(parsedTx),
                        post: { connect: { postId: post.postId } }
                    }
                });
            }
        });
    }

    private transformContent(parsedTx: ParsedTransaction): any {
        return {
            text: parsedTx.contents.find(c => c.type === 'text/plain')?.data,
            media: parsedTx.contents
                .filter(c => c.type.startsWith('image/'))
                .map(img => ({
                    type: img.type,
                    data: img.data,
                    encoding: img.encoding,
                    filename: img.filename
                })),
            metadata: parsedTx.contents
                .filter(c => c.type === 'application/json')
                .map(json => JSON.parse(json.data as string)),
            tags: parsedTx.tags
        };
    }

    private extractQuestion(parsedTx: ParsedTransaction): string {
        return parsedTx.contents.find(c => c.type === 'text/plain')?.data as string || '';
    }

    private findOptionContent(index: number, parsedTx: ParsedTransaction): string {
        return parsedTx.contents
            .find(c => c.type === 'application/json' && (JSON.parse(c.data as string)).optionIndex === index)
            ?.data as string || '';
    }

    private createLockLike(option: any, parsedTx: ParsedTransaction) {
        return {
            txid: `${parsedTx.txid}-opt${option.index}-${Date.now()}`,
            amount: option.lockAmount,
            lockPeriod: option.lockDuration,
            createdAt: parsedTx.timestamp
        };
    }

    private getLockAmount(parsedTx: ParsedTransaction): number {
        const lockContent = parsedTx.contents.find(c => c.type === 'lock')?.data;
        if (!lockContent) return 0;
        const content = Buffer.isBuffer(lockContent) ? lockContent.toString() : lockContent;
        const match = content.match(/lockAmount=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    private getLockDuration(parsedTx: ParsedTransaction): number {
        const lockContent = parsedTx.contents.find(c => c.type === 'lock')?.data;
        if (!lockContent) return 0;
        const content = Buffer.isBuffer(lockContent) ? lockContent.toString() : lockContent;
        const match = content.match(/lockDuration=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    async disconnect() {
        await this.prisma.$disconnect();
    }
}