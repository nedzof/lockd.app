import { describe, expect, test, beforeEach, afterEach, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TransactionScanner } from '../transactionScanner';
import { ScannerConfig } from '../scannerTypes';

const prisma = new PrismaClient();

describe('Integration Tests', () => {
    const config: ScannerConfig = {
        jungleBusUrl: 'https://junglebus.gorillapool.io/v1',
        startHeight: 0,
        batchSize: 10
    };

    let scanner: TransactionScanner;

    beforeEach(async () => {
        // Clear database before each test
        await prisma.voteQuestion.deleteMany();
        await prisma.post.deleteMany();
        
        scanner = new TransactionScanner(config);
    });

    test('should process MAP protocol transaction', async () => {
        // Use a real MAP protocol transaction ID
        const txid = '429ee4f826afe16269cfdcadec56bc82e49983660ec063a8235c981167f5e660';

        // Create a promise that resolves when the transaction is processed
        const processedPromise = new Promise((resolve, reject) => {
            scanner.once('transaction', (event: TransactionEvent) => {
                if (event.type === 'TRANSACTION_PARSED') {
                    resolve(event.data);
                }
            });
            scanner.once('error', reject);
        });

        // Process the transaction
        await scanner.scanTransaction(txid);
        
        // Wait for the transaction to be processed
        await processedPromise;

        // Get scanner stats
        const stats = scanner.getStats();
        expect(stats.processedTransactions).toBe(1);
        expect(stats.failedTransactions).toBe(0);

        // Verify database entry
        const post = await prisma.post.findUnique({
            where: { postId: txid },
            include: {
                voteQuestion: true
            }
        });

        expect(post).toBeDefined();
        if (post) {
            expect(post.type).toBe('vote_question');
            expect(post.voteQuestion).toBeDefined();
            expect(post.voteQuestion?.protocol).toBe('MAP');
        }
    }, 30000); // Increase timeout to 30s for network requests

    afterEach(async () => {
        await scanner.disconnect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });
});
