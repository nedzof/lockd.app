import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parseMapTransaction } from '../mapTransactionParser';
import { transactionProcessor } from '../unifiedDbWorker';
import { JungleBusTransaction, ParsedPost } from '../types';

const prisma = new PrismaClient();

describe('MAP Transaction Processing Integration Test', () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should process a real MAP transaction with vote options', async () => {
        // 1. Load transaction from local file
        const txid = '429ee4f826afe16269cfdcadec56bc82e49983660ec063a8235c981167f5e660';
        const txPath = path.join(__dirname, '..', `${txid}.json`);
        const tx: JungleBusTransaction = JSON.parse(fs.readFileSync(txPath, 'utf-8'));

        // 2. Parse the MAP transaction
        const parsedPost = await parseMapTransaction(tx);
        expect(parsedPost).not.toBeNull();
        
        if (!parsedPost) {
            throw new Error('Failed to parse transaction');
        }

        // Validate basic transaction data
        expect(parsedPost.txid).toBe(txid);
        expect(parsedPost.blockHeight).toBeDefined();
        expect(parsedPost.timestamp).toBeDefined();

        // Validate content
        expect(parsedPost.content).toBeDefined();
        expect(typeof parsedPost.content.text).toBe('string');
        
        // Validate metadata
        expect(parsedPost.metadata).toBeDefined();
        expect(parsedPost.metadata.type).toBe('vote_question');
        expect(parsedPost.metadata.voteOptions?.length).toBe(7);
        expect(parsedPost.metadata.optionsHash).toBeDefined();
        
        // Process the transaction
        await transactionProcessor.processBatch([parsedPost]);

        // Verify database state
        const post = await prisma.post.findUnique({
            where: { txid },
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
            expect(option.lock_duration).toBe(1);
            expect(option.post_txid).toBe(txid);
        }

        // Clean up test data
        await prisma.post.deleteMany({
            where: { txid }
        });
    });
});
