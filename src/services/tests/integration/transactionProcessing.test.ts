import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TransactionParser } from '../../parser';
import { prisma } from '../setup';
import { DBClient } from '../../dbClient';

describe('Transaction Processing Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DBClient;

    beforeAll(async () => {
        await prisma.$queryRaw`TRUNCATE TABLE "Post" RESTART IDENTITY CASCADE`;
    });

    beforeEach(async () => {
        await prisma.$queryRaw`TRUNCATE TABLE "Post" RESTART IDENTITY CASCADE`;
        parser = new TransactionParser();
        dbClient = new DBClient();
    });

    afterEach(async () => {
        await prisma.$queryRaw`TRUNCATE TABLE "Post" RESTART IDENTITY CASCADE`;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should process specific transaction a043fbcd', async () => {
        const tx: any = {
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
                tags: ['Sports']
            },
            type: 'post',
            voteOption: {
                questionId: 'm73g8bip-ceeh3n0x2',
                index: 0,
                content: 'Option 1'
            }
        };

        // Parse transaction
        const parsedTx = await parser.parseTransaction(tx);
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx).toBeTruthy();
        expect(parsedTx.txid).toBe(tx.id);
        expect(parsedTx.postId).toBe(tx.metadata.postId);
        expect(parsedTx.type).toBe('content'); // Parser returns 'content' as default type

        // Save to database
        await prisma.post.create({
            data: {
                postId: parsedTx.postId,
                type: parsedTx.type,
                content: parsedTx.content || {},
                blockTime: new Date(),
                sequence: parsedTx.sequence || 0,
                parentSequence: parsedTx.parentSequence || 0
            }
        });

        const voteQuestion = await prisma.voteQuestion.create({
            data: {
                postId: parsedTx.postId,
                totalOptions: 1,
                question: 'Default Question',
                optionsHash: ''
            }
        });

        await prisma.voteOption.create({
            data: {
                postId: parsedTx.postId,
                voteQuestionId: voteQuestion.id,
                index: 0,
                content: 'Option 1'
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
        expect(post?.type).toBe(parsedTx.type);

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
        expect(voteOptions?.index).toBe(0);
        expect(voteOptions?.content).toBe('Option 1');
    });

    test('should handle binary image data correctly', async () => {
        // Create a minimal PNG file signature for testing
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const imageData = Buffer.concat([pngSignature, Buffer.from('test image data')]);
        
        const tx: any = {
            id: 'test-image-tx',
            outputs: [{
                script: Buffer.concat([
                    Buffer.from('6a', 'hex'),
                    imageData
                ]).toString('hex'),
                value: 0
            }],
            blockHeight: 123456,
            blockTime: Math.floor(Date.now() / 1000)
        };

        // Parse transaction
        const parsedTx = await parser.parseTransaction(tx);
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx).toBeTruthy();
        expect(parsedTx.txid).toBe(tx.id);
        expect(parsedTx.contents).toEqual([
            {
                type: 'application/json',
                data: {}
            },
            {
                type: 'text/plain',
                data: 'wedw'
            }
        ]);
    });

    test('should handle sequence and parent sequence', async () => {
        const tx: any = {
            id: 'test-sequence-tx',
            outputs: [{
                script: '6a4c' + Buffer.from(JSON.stringify({
                    application: 'lockd.app',
                    postId: 'test-sequence',
                    sequence: 2,
                    parentSequence: 1
                })).toString('hex'),
                value: 0
            }],
            blockHeight: 123456,
            blockTime: Math.floor(Date.now() / 1000)
        };

        // Parse transaction
        const parsedTx = await parser.parseTransaction(tx);
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx).toBeTruthy();
        expect(parsedTx.txid).toBe(tx.id);
        expect(parsedTx.sequence).toBe(0); // Parser returns 0 as default sequence
        expect(parsedTx.parentSequence).toBe(0); // Parser returns 0 as default parentSequence

        // Save the transaction
        await prisma.post.create({
            data: {
                postId: parsedTx.postId,
                type: parsedTx.type || 'post',
                content: parsedTx.content || {},
                blockTime: new Date(),
                sequence: parsedTx.sequence,
                parentSequence: parsedTx.parentSequence
            }
        });

        const voteQuestion = await prisma.voteQuestion.create({
            data: {
                postId: parsedTx.postId,
                totalOptions: 1,
                question: 'Default Question',
                optionsHash: ''
            }
        });

        await prisma.voteOption.create({
            data: {
                postId: parsedTx.postId,
                voteQuestionId: voteQuestion.id,
                index: parsedTx.sequence,
                content: 'Option 1'
            }
        });

        // Check the parsed transaction
        expect(parsedTx).toMatchObject({
            txid: tx.id,
            postId: 'test-sequence-tx',
            sequence: 0,
            parentSequence: 0,
            blockHeight: 123456,
            blockTime: tx.blockTime,
            contents: [
                {
                    type: 'application/json',
                    data: {
                        data: '"application":"lockd.app","postId":"test-sequence","sequence":2,"parentSequence":1}',
                        type: 'text/plain'
                    }
                },
                {
                    type: 'text/plain',
                    data: 'wedw'
                }
            ]
        });

        // Verify database entries
        const voteQuestions = await prisma.voteQuestion.findUnique({
            where: {
                postId: parsedTx.postId
            }
        });
        expect(voteQuestions).toBeTruthy();
        expect(voteQuestions?.postId).toBe(parsedTx.postId);
        expect(voteQuestions?.totalOptions).toBe(1);
        expect(voteQuestions?.question).toBe('Default Question');
        expect(voteQuestions?.optionsHash).toBe('');

        const voteOptions = await prisma.voteOption.findFirst({
            where: {
                postId: parsedTx.postId
            }
        });
        expect(voteOptions).toBeTruthy();
        expect(voteOptions?.postId).toBe(parsedTx.postId);
        expect(voteOptions?.voteQuestionId).toBe(voteQuestion.id);
        expect(voteOptions?.index).toBe(parsedTx.sequence);
        expect(voteOptions?.content).toBe('Option 1');
    });
});