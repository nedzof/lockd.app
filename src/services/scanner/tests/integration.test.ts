import { describe, expect, test } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TransactionScanner } from '../transactionScanner';
import { ScannerConfig } from '../scannerTypes';

const prisma = new PrismaClient();

describe('Integration Tests', () => {
    const config: ScannerConfig = {
        jungleBusUrl: 'https://junglebus.gorillapool.io/v1/transaction/get/',
        startHeight: 0,
        batchSize: 10
    };

    const scanner = new TransactionScanner(config);

    test('should process MAP protocol transaction', async () => {
        // Mock transaction ID that we know contains a MAP protocol transaction
        const txid = 'mock-txid';

        // Process the transaction
        await scanner.scanTransaction(txid);

        // Get scanner stats
        const stats = scanner.getStats();
        expect(stats.processedTransactions).toBe(1);
        expect(stats.failedTransactions).toBe(0);

        // Verify database entry
        const post = await prisma.post.findUnique({
            where: { id: txid }
        });

        expect(post).toBeDefined();
        if (post) {
            expect(post.type).toBe('vote_question');
            expect(post.content).toBeDefined();
            expect(post.metadata).toBeDefined();
            expect(post.metadata.protocol).toBe('MAP');
        }
    });

    afterAll(async () => {
        await scanner.disconnect();
        await prisma.$disconnect();
    });
});
