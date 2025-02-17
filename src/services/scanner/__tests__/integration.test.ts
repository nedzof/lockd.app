import { describe, expect, test } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TransactionDecoder } from '../../parser/transactionDecoder';
import { MAPProtocolHandler } from '../../parser/mapProtocolHandler';
import { JungleBusTransaction, OpReturnData } from '../../parser/types';
import { TransactionProcessor } from '../transactionProcessor';

const prisma = new PrismaClient();

describe('Integration Tests', () => {
    const transactionDecoder = new TransactionDecoder();
    const mapProtocolHandler = new MAPProtocolHandler();
    const processor = new TransactionProcessor();

    test('should decode MAP protocol transaction', async () => {
        // Mock transaction data
        const mockTransaction: JungleBusTransaction = {
            id: 'mock-txid',
            outputs: [
                {
                    value: 0,
                    script: Buffer.from('6a' + Buffer.from('app=lockd.app&type=vote_question&content=What is your favorite color?&totalOptions=3&optionsHash=abc123&postId=post123').toString('hex'), 'hex').toString('hex')
                }
            ],
            block_height: 123456,
            block_time: Math.floor(Date.now() / 1000)
        };

        // Decode transaction
        const opReturnData = transactionDecoder.decodeTransaction(mockTransaction);
        expect(opReturnData).toBeDefined();
        expect(opReturnData.length).toBeGreaterThan(0);

        // Parse MAP protocol data
        const parsedPost = await mapProtocolHandler.parseTransaction(
            opReturnData,
            mockTransaction.id,
            mockTransaction.block_height,
            mockTransaction.block_time
        );

        // Verify parsed data
        expect(parsedPost).toBeDefined();
        if (parsedPost) {
            expect(parsedPost.id).toBe('mock-txid');
            expect(parsedPost.type).toBe('vote_question');
            expect(parsedPost.content).toBe('What is your favorite color?');
            expect(parsedPost.metadata).toBeDefined();
            expect(parsedPost.metadata.totalOptions).toBe(3);
            expect(parsedPost.metadata.optionsHash).toBe('abc123');
            expect(parsedPost.metadata.postId).toBe('post123');
            expect(parsedPost.metadata.protocol).toBe('MAP');
            expect(parsedPost.metadata.blockHeight).toBe(123456);
            expect(parsedPost.metadata.blockTime).toBe(mockTransaction.block_time);
        }

        // Process transactions
        await processor.processBatch([parsedPost]);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });
});
