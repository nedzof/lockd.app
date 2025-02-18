import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { TransactionParser } from '../../parser';
import { DBClient } from '../../dbClient';
import { Transaction } from '../../types';
import { PrismaClient } from '@prisma/client';

describe('Transaction Processing Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DBClient;
    let prisma: PrismaClient;

    beforeAll(async () => {
        parser = new TransactionParser();
        dbClient = new DBClient();
        prisma = new PrismaClient();
    });

    afterAll(async () => {
        await dbClient.disconnect();
        await prisma.$disconnect();
    });

    test('should process specific transaction a043fbcd', async () => {
        const tx: Transaction = {
            id: 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598',
            inputs: [],
            outputs: [{
                script: '6a4c8e7b226170706c69636174696f6e223a226c6f636b642e617070222c22706f73744964223a226d373367386269702d63656568336e307832222c2274616773223a5b2253706f727473225d7d'
            }],
            blockHeight: 1000,
            blockTime: new Date('2025-02-13T14:42:27.025Z')
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx).toMatchObject({
            txid: tx.id,
            postId: 'm73g8bip-ceeh3n0x2',
            protocol: 'MAP',
            blockHeight: 1000,
            contents: expect.arrayContaining([
                expect.objectContaining({
                    type: 'text/plain',
                    data: 'wedw'
                })
            ]),
            tags: ['Sports'],
            vote: expect.objectContaining({
                optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                options: expect.arrayContaining([
                    expect.objectContaining({
                        lockAmount: 1000,
                        lockDuration: 1
                    })
                ])
            })
        });

        // Save to database
        await dbClient.saveTransaction(parsedTx);

        // Verify database state
        const dbPost = await prisma.post.findUnique({
            where: { postId: parsedTx.postId },
            include: {
                voteQuestion: {
                    include: {
                        voteOptions: {
                            include: {
                                lockLikes: true
                            }
                        }
                    }
                }
            }
        });

        expect(dbPost).toMatchObject({
            postId: parsedTx.postId,
            type: 'content',
            protocol: 'MAP',
            content: expect.any(Object),
            timestamp: parsedTx.timestamp,
            sequence: parsedTx.sequence,
            parentSequence: parsedTx.parentSequence
        });

        if (parsedTx.vote) {
            const dbQuestion = await prisma.voteQuestion.findUnique({
                where: { postId: parsedTx.postId }
            });
            expect(dbQuestion).toMatchObject({
                postId: parsedTx.postId,
                protocol: 'MAP',
                question: expect.any(String),
                totalOptions: parsedTx.vote.totalOptions,
                optionsHash: parsedTx.vote.optionsHash
            });
        }
    });

    test('should handle binary image data correctly', async () => {
        // Create a PNG buffer
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const imageData = Buffer.concat([pngSignature, Buffer.from('test image data')]);
        
        const tx: Transaction = {
            id: 'test-image-tx',
            inputs: [],
            outputs: [{
                script: Buffer.concat([
                    Buffer.from('6a', 'hex'), // OP_RETURN
                    Buffer.from([imageData.length]), // PUSHDATA
                    imageData
                ]).toString('hex')
            }],
            blockHeight: 1001,
            blockTime: new Date()
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx.contents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'image/png',
                    encoding: 'base64',
                    data: expect.any(String)
                })
            ])
        );
    });

    test('should handle sequence and parent sequence', async () => {
        const tx: Transaction = {
            id: 'test-sequence-tx',
            inputs: [],
            outputs: [{
                script: '6a4c6d7b226170706c69636174696f6e223a226c6f636b642e617070222c2274797065223a22766f74655f6f7074696f6e222c22706f73744964223a226d373367386269702d63656568336e307832222c2273657175656e6365223a2231222c22706172656e7453657175656e6365223a2230227d'
            }],
            blockHeight: 1002,
            blockTime: new Date()
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx.sequence).toBe(1);
        expect(parsedTx.parentSequence).toBe(0);
    });

    afterEach(async () => {
        // Clean up test data
        await prisma.$transaction([
            prisma.lockLike.deleteMany(),
            prisma.voteOption.deleteMany(),
            prisma.voteQuestion.deleteMany(),
            prisma.post.deleteMany()
        ]);
    });
});