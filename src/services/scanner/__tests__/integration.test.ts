import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parseMapTransaction } from '../mapTransactionParser';
import { TransactionProcessor } from '../transactionProcessor';
import { JungleBusTransaction } from '../types';

const prisma = new PrismaClient();

describe('Integration Tests', () => {
    beforeAll(async () => {
        await prisma.$connect();
        // Clean up any existing test data
        await prisma.voteOption.deleteMany({
            where: { txid: 'test_txid' }
        });
        await prisma.post.deleteMany({
            where: { txid: 'test_txid' }
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.voteOption.deleteMany({
            where: { txid: 'test_txid' }
        });
        await prisma.post.deleteMany({
            where: { txid: 'test_txid' }
        });
        await prisma.$disconnect();
    });

    it('should parse a MAP transaction with vote data', async () => {
        const tx: JungleBusTransaction = {
            id: 'test_txid',
            block_hash: 'test_block_hash',
            block_height: 123456,
            block_time: 1234567890,
            outputs: [
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_question&content=What is your favorite color?&postId=test123&totalOptions=7&optionsHash=abc123').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=0&content=Red&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=1&content=Blue&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=2&content=Green&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=3&content=Yellow&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=4&content=Purple&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=5&content=Orange&lockAmount=1000&lockDuration=86400').toString('hex')
                },
                {
                    value: 0,
                    script: Buffer.from('OP_RETURN MAP type=vote_option&optionIndex=6&content=Pink&lockAmount=1000&lockDuration=86400').toString('hex')
                }
            ]
        };

        const parsedPost = await parseMapTransaction(tx);
        expect(parsedPost).toBeDefined();
        if (!parsedPost) throw new Error('Failed to parse post');

        expect(parsedPost.type).toBe('vote_question');
        expect(parsedPost.votingData?.question).toBeDefined();
        expect(parsedPost.votingData?.options.length).toBe(7);
        expect(parsedPost.votingData?.metadata.optionsHash).toBeDefined();
        expect(parsedPost.votingData?.metadata.totalOptions).toBe(7);

        // 5. Process the parsed post
        const transactionProcessor = new TransactionProcessor();
        await transactionProcessor.processBatch([parsedPost]);

        // Verify database state
        const post = await prisma.post.findUnique({
            where: { txid: 'test_txid' },
            include: {
                vote_options: true
            }
        });

        expect(post).toBeDefined();
        expect(post?.is_vote).toBe(true);
        expect(post?.metadata).toBeDefined();

        // Verify vote options
        expect(post?.vote_options).toHaveLength(7);
        for (const option of post?.vote_options || []) {
            expect(option.lock_amount).toBe(1000);
            expect(option.lock_duration).toBe(86400);
            expect(option.txid).toBe('test_txid');
        }
    });
});
