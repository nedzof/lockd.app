import { describe, expect, test, beforeEach, afterEach, afterAll, beforeAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TransactionScanner } from '../transactionScanner';
import { TransactionParser } from '../../parser/transactionParser';
import { MAPProtocolHandler } from '../../parser/map/mapProtocolHandler';
import { DBTransactionProcessor } from '../../dbworker/transactionProcessor';
import { BasePost } from '../../common/types';
import { ScannerConfig } from '../scannerTypes';
import { 
    TransactionEvent, 
    ScannedTransactionData, 
    ParsedTransactionData,
    SavedTransactionData
} from '../../common/types';

const prisma = new PrismaClient();

// Mock database processor
class MockDBProcessor extends DBTransactionProcessor {
    async processPost(post: BasePost): Promise<void> {
        // Do nothing, just simulate success
        return Promise.resolve();
    }
}

describe('Integration Tests', () => {
    const config: ScannerConfig = {
        jungleBusUrl: 'https://junglebus.gorillapool.io/v1',
        startHeight: 0,
        batchSize: 10
    };

    let scanner: TransactionScanner;
    let parser: TransactionParser;
    let mapHandler: MAPProtocolHandler;
    let dbProcessor: DBTransactionProcessor;

    const setupDatabase = async () => {
        try {
            // Create Post table
            await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "Post" (
                    "id" TEXT NOT NULL,
                    "postId" TEXT NOT NULL,
                    "type" TEXT NOT NULL,
                    "content" TEXT NOT NULL,
                    "timestamp" TIMESTAMP(3) NOT NULL,
                    "sequence" INTEGER NOT NULL,
                    "parentSequence" INTEGER NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    CONSTRAINT "Post_pkey" PRIMARY KEY ("id"),
                    CONSTRAINT "Post_postId_key" UNIQUE ("postId")
                )
            `;

            // Create Post index
            await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Post_postId_idx" ON "Post"("postId")`;

            // Create VoteQuestion table
            await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "VoteQuestion" (
                    "id" TEXT NOT NULL,
                    "postId" TEXT NOT NULL,
                    "question" TEXT NOT NULL,
                    "totalOptions" INTEGER NOT NULL,
                    "optionsHash" TEXT NOT NULL,
                    "protocol" TEXT NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    CONSTRAINT "VoteQuestion_pkey" PRIMARY KEY ("id"),
                    CONSTRAINT "VoteQuestion_postId_key" UNIQUE ("postId"),
                    CONSTRAINT "VoteQuestion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE RESTRICT ON UPDATE CASCADE
                )
            `;

            // Create VoteQuestion index
            await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "VoteQuestion_postId_idx" ON "VoteQuestion"("postId")`;

            // Create VoteOption table
            await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "VoteOption" (
                    "id" TEXT NOT NULL,
                    "postId" TEXT NOT NULL,
                    "index" INTEGER NOT NULL,
                    "content" TEXT NOT NULL,
                    "lockAmount" INTEGER NOT NULL,
                    "lockDuration" INTEGER NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    CONSTRAINT "VoteOption_pkey" PRIMARY KEY ("id"),
                    CONSTRAINT "VoteOption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE RESTRICT ON UPDATE CASCADE
                )
            `;

            // Create VoteOption index
            await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "VoteOption_postId_idx" ON "VoteOption"("postId")`;

        } catch (error) {
            console.error('Error setting up database:', error);
            throw error;
        }
    };

    const clearDatabase = async () => {
        try {
            // Drop tables in correct order due to foreign key constraints
            await prisma.$executeRaw`DROP TABLE IF EXISTS "VoteOption" CASCADE`;
            await prisma.$executeRaw`DROP TABLE IF EXISTS "VoteQuestion" CASCADE`;
            await prisma.$executeRaw`DROP TABLE IF EXISTS "Post" CASCADE`;
        } catch (error) {
            console.error('Error clearing database:', error);
            throw error;
        }
    };

    beforeAll(async () => {
        // Clear and recreate tables
        await clearDatabase();
        await setupDatabase();
    });

    beforeEach(() => {
        // Create and configure components
        mapHandler = new MAPProtocolHandler();
        parser = new TransactionParser();
        parser.addProtocolHandler(mapHandler);
        dbProcessor = new MockDBProcessor();
        scanner = new TransactionScanner(config);
        scanner.setParser(parser);
        scanner.setDBProcessor(dbProcessor);
    });

    afterEach(() => {
        // Clean up any event listeners
        scanner.removeAllListeners();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should process MAP protocol vote transaction', async () => {
        const txid = 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598';
        
        // Create promises that resolve when each event type is processed
        const transactionScannedPromise = new Promise<void>((resolve) => {
            scanner.once('TRANSACTION_SCANNED', (event) => {
                console.log('Received event: TRANSACTION_SCANNED');
                resolve();
            });
        });

        const postParsedPromise = new Promise<void>((resolve) => {
            scanner.once('POST_PARSED', (event) => {
                console.log('Received event: POST_PARSED');
                resolve();
            });
        });

        console.log('Starting transaction scan...');
        const result = await scanner.scanTransaction(txid);

        console.log('Waiting for events...');
        await Promise.all([transactionScannedPromise, postParsedPromise]);

        expect(result).toBeDefined();
        expect(result?.type).toBe('vote_question');
        expect(result?.content).toBeDefined();
        expect(result?.metadata).toBeDefined();
        expect(result?.metadata.protocol).toBe('MAP');
    }, 60000); // Increase timeout to 60 seconds
});
