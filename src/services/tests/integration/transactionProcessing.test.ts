import { PrismaClient } from '@prisma/client';
import { Scanner } from '../../scanner';
import { DBClient } from '../../dbClient';
import { TransactionParser } from '../../parser';
import { logger } from '../../../utils/logger';

// Mock JungleBus client
class MockJungleBusClient {
    private messageCallback: (message: any) => void = () => {};

    onMessage(callback: (message: any) => void) {
        this.messageCallback = callback;
    }

    // Helper to simulate incoming messages
    simulateMessage(message: any) {
        this.messageCallback(message);
    }

    connect() {
        return Promise.resolve();
    }
}

describe('Transaction Processing Integration Tests', () => {
    let prisma: PrismaClient;
    let dbClient: DBClient;
    let scanner: Scanner;
    let mockJungleBus: MockJungleBusClient;

    beforeAll(async () => {
        // Initialize Prisma with test database
        prisma = new PrismaClient();
        await prisma.$connect();
    });

    beforeEach(async () => {
        // Clear database before each test
        await prisma.lockLike.deleteMany();
        await prisma.post.deleteMany();
        await prisma.processedTransaction.deleteMany();

        // Initialize components
        mockJungleBus = new MockJungleBusClient();
        dbClient = new DBClient();
        const parser = new TransactionParser();
        scanner = new Scanner(mockJungleBus as any, parser, dbClient);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should process and save a single transaction', async () => {
        // Sample transaction with raw format
        const sampleTx = {
            type: 'transaction',
            transaction: {
                h: 'test_txid_1',
                raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0122020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac00000000',
            }
        };

        // Start scanner
        await scanner.start();

        // Simulate incoming transaction
        mockJungleBus.simulateMessage(sampleTx);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify transaction was saved
        const savedTx = await prisma.processedTransaction.findFirst({
            where: { txid: 'test_txid_1' }
        });

        expect(savedTx).toBeTruthy();
        expect(savedTx?.txid).toBe('test_txid_1');
    });

    it('should process and save transactions from a block', async () => {
        // Sample block with multiple transactions
        const sampleBlock = {
            type: 'block',
            block: {
                height: 12345,
                timestamp: '2025-02-19T18:00:00.000Z',
                tx: [
                    {
                        h: 'test_txid_2',
                        raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0122020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac00000000'
                    },
                    {
                        h: 'test_txid_3',
                        raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0122020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac00000000'
                    }
                ]
            }
        };

        // Start scanner
        await scanner.start();

        // Simulate incoming block
        mockJungleBus.simulateMessage(sampleBlock);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify all transactions were saved
        const savedTxs = await prisma.processedTransaction.findMany({
            where: {
                txid: {
                    in: ['test_txid_2', 'test_txid_3']
                }
            }
        });

        expect(savedTxs).toHaveLength(2);
        expect(savedTxs.map(tx => tx.txid)).toContain('test_txid_2');
        expect(savedTxs.map(tx => tx.txid)).toContain('test_txid_3');
        expect(savedTxs[0].blockHeight).toBe(12345);
    });

    it('should handle transactions with MAP protocol data', async () => {
        // Sample MAP protocol transaction
        const mapTx = {
            type: 'transaction',
            transaction: {
                h: 'test_map_txid',
                raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0322020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac0000000000000000166a146d617020707265666978207465737420706f7374696e670000000000000000166a0f6c6f636b207465737420766f7465'
            }
        };

        // Start scanner
        await scanner.start();

        // Simulate incoming transaction
        mockJungleBus.simulateMessage(mapTx);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify transaction was saved
        const savedTx = await prisma.processedTransaction.findFirst({
            where: { txid: 'test_map_txid' }
        });

        expect(savedTx).toBeTruthy();
        expect(savedTx?.txid).toBe('test_map_txid');

        // Check for MAP protocol data
        const posts = await prisma.post.findMany({
            where: { postId: 'test_map_txid' }
        });

        expect(posts.length).toBeGreaterThan(0);
    });

    it('should handle duplicate transactions', async () => {
        // Sample duplicate transactions
        const tx1 = {
            type: 'transaction',
            transaction: {
                h: 'test_dupe_txid',
                raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0122020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac00000000'
            }
        };

        // Start scanner
        await scanner.start();

        // Simulate same transaction twice
        mockJungleBus.simulateMessage(tx1);
        mockJungleBus.simulateMessage(tx1);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify only one transaction was saved
        const savedTxs = await prisma.processedTransaction.findMany({
            where: { txid: 'test_dupe_txid' }
        });

        expect(savedTxs).toHaveLength(1);
    });

    it('should handle large blocks with many transactions', async () => {
        // Create a large block with 100 transactions
        const largeTxs = Array.from({ length: 100 }, (_, i) => ({
            h: `test_large_txid_${i}`,
            raw: '0100000001c6beef387f4b1172e6f8456313775d8a8b5502f72a4033ab879ccf23cd9f34530000000000ffffffff0122020000000000001976a914d8c43e6f68ca4ea1e9b93da2d1e3a95118fa4a5688ac00000000'
        }));

        const largeBlock = {
            type: 'block',
            block: {
                height: 12346,
                timestamp: '2025-02-19T18:00:00.000Z',
                tx: largeTxs
            }
        };

        // Start scanner
        await scanner.start();

        // Simulate incoming large block
        mockJungleBus.simulateMessage(largeBlock);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify all transactions were saved
        const savedTxs = await prisma.processedTransaction.findMany({
            where: {
                txid: {
                    startsWith: 'test_large_txid_'
                }
            }
        });

        expect(savedTxs).toHaveLength(100);
        expect(savedTxs[0].blockHeight).toBe(12346);
    });
});