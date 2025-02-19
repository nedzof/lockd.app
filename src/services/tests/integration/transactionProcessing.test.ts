import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TransactionParser } from '../../parser';
import { prisma } from '../setup';
import { DBClient } from '../../dbClient';

describe('Transaction Processing Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DBClient;

    beforeAll(async () => {
        // Clean database before all tests
        await prisma.$queryRaw`TRUNCATE TABLE "Post" RESTART IDENTITY CASCADE`;
    });

    beforeEach(async () => {
        parser = new TransactionParser();
        dbClient = new DBClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should process and seed posts and votes', async () => {
        const transactions = [
            {
                id: 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598',
                outputs: [{
                    script: '6a4c8e7b226170706c69636174696f6e223a226c6f636b642e617070222c22706f73744964223a226d373367386269702d63656568336e307832222c2274616773223a5b2253706f727473225d7d',
                    value: 0,
                    metadata: {
                        application: 'lockd.app',
                        postId: 'm73g8bip-ceeh3n0x2',
                        tags: ['Sports']
                    }
                }],
                blockHeight: 123456,
                blockTime: Math.floor(Date.now() / 1000),
                metadata: {
                    application: 'lockd.app',
                    postId: 'm73g8bip-ceeh3n0x2',
                    tags: ['Sports'],
                    content: 'This is a sports-related post'
                },
                type: 'post',
                voteOption: {
                    questionId: 'm73g8bip-ceeh3n0x2',
                    index: 0,
                    content: 'Option 1'
                }
            },
            {
                id: 'b154fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b599',
                outputs: [{
                    script: '6a4c8e7b226170706c69636174696f6e223a226c6f636b642e617070222c22706f73744964223a226e38396738626970222c2274616773223a5b22546563686e6f6c6f6779225d7d',
                    value: 0,
                    metadata: {
                        application: 'lockd.app',
                        postId: 'n89g8bip',
                        tags: ['Technology']
                    }
                }],
                blockHeight: 123457,
                blockTime: Math.floor(Date.now() / 1000),
                metadata: {
                    application: 'lockd.app',
                    postId: 'n89g8bip',
                    tags: ['Technology'],
                    content: 'This is a technology-related post'
                },
                type: 'post',
                voteOption: {
                    questionId: 'n89g8bip',
                    index: 0,
                    content: 'Yes'
                }
            }
        ];

        // Process and save each transaction
        for (const tx of transactions) {
            const parsedTx = await parser.parseTransaction(tx);
            if (!parsedTx) {
                throw new Error('Failed to parse transaction');
            }

            // Save post
            await prisma.post.create({
                data: {
                    postId: parsedTx.postId,
                    type: parsedTx.type || 'content',
                    content: tx.metadata.content || '',
                    blockTime: new Date(tx.blockTime * 1000),
                    sequence: parsedTx.sequence || 0,
                    parentSequence: parsedTx.parentSequence || 0
                }
            });

            // Create vote question
            const voteQuestion = await prisma.voteQuestion.create({
                data: {
                    postId: parsedTx.postId,
                    totalOptions: 1,
                    question: 'Do you agree?',
                    optionsHash: ''
                }
            });

            // Create vote option
            await prisma.voteOption.create({
                data: {
                    postId: parsedTx.postId,
                    voteQuestionId: voteQuestion.id,
                    index: tx.voteOption.index,
                    content: tx.voteOption.content
                }
            });

            // Verify database state
            const post = await prisma.post.findUnique({
                where: {
                    postId: parsedTx.postId
                }
            });
            expect(post).toBeTruthy();
            expect(post?.postId).toBe(parsedTx.postId);
            expect(post?.type).toBe(parsedTx.type || 'content');
            expect(post?.content).toBe(tx.metadata.content);

            const voteQuestionResult = await prisma.voteQuestion.findUnique({
                where: {
                    postId: parsedTx.postId
                }
            });
            expect(voteQuestionResult).toBeTruthy();
            expect(voteQuestionResult?.postId).toBe(parsedTx.postId);

            const voteOptions = await prisma.voteOption.findFirst({
                where: {
                    postId: parsedTx.postId
                }
            });
            expect(voteOptions).toBeTruthy();
            expect(voteOptions?.postId).toBe(parsedTx.postId);
            expect(voteOptions?.voteQuestionId).toBe(voteQuestion.id);
            expect(voteOptions?.index).toBe(tx.voteOption.index);
            expect(voteOptions?.content).toBe(tx.voteOption.content);
        }
    });
});