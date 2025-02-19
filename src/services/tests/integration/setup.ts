import { PrismaClient } from '@prisma/client';

interface ProcessedTx {
    id: string;
    txid: string;
    blockHeight: number;
    blockTime: Date;
    type: string;
}

interface Post {
    id: string;
    postId: string;
    type: string;
    content: string;
    blockTime: Date;
    sequence: number;
    parentSequence: number;
}

interface VoteQuestion {
    id: string;
    postId: string;
    question: string;
    totalOptions: number;
    optionsHash: string;
}

interface VoteOption {
    id: string;
    postId: string;
    voteQuestionId: string;
    index: number;
    content: string;
}

interface LockLike {
    id: string;
    txid: string;
    postId: string;
    voteOptionId: string;
    lockAmount: number;
    lockDuration: number;
    isProcessed: boolean;
}

const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

export async function setupTestDatabase() {
    try {
        console.log('Setting up test database...');
        
        // Drop all existing data using raw queries
        await prisma.$transaction([
            prisma.$executeRaw`DROP TABLE IF EXISTS "LockLike" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "VoteOption" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "VoteQuestion" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "Post" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "ProcessedTransaction" CASCADE`
        ]);

        // Create tables
        await prisma.$transaction([
            prisma.$executeRaw`
                CREATE TABLE "ProcessedTransaction" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "txid" TEXT UNIQUE NOT NULL,
                    "blockHeight" INTEGER NOT NULL,
                    "blockTime" TIMESTAMP(3) NOT NULL,
                    "type" TEXT NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL
                )
            `,
            prisma.$executeRaw`
                CREATE TABLE "Post" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "postId" TEXT UNIQUE NOT NULL,
                    "type" TEXT NOT NULL,
                    "content" JSONB NOT NULL,
                    "blockTime" TIMESTAMP(3) NOT NULL,
                    "sequence" INTEGER NOT NULL,
                    "parentSequence" INTEGER NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL
                )
            `,
            prisma.$executeRaw`
                CREATE TABLE "VoteQuestion" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "postId" TEXT UNIQUE NOT NULL,
                    "question" TEXT NOT NULL,
                    "totalOptions" INTEGER NOT NULL,
                    "optionsHash" TEXT NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
                )
            `,
            prisma.$executeRaw`
                CREATE TABLE "VoteOption" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "postId" TEXT NOT NULL,
                    "voteQuestionId" UUID NOT NULL,
                    "index" INTEGER NOT NULL,
                    "content" TEXT NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
                    FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
                )
            `,
            prisma.$executeRaw`
                CREATE TABLE "LockLike" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "txid" TEXT UNIQUE NOT NULL,
                    "postId" TEXT NOT NULL,
                    "voteOptionId" UUID,
                    "lockAmount" INTEGER NOT NULL,
                    "lockDuration" INTEGER NOT NULL,
                    "isProcessed" BOOLEAN NOT NULL DEFAULT FALSE,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL,
                    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
                    FOREIGN KEY ("voteOptionId") REFERENCES "VoteOption"("id") ON DELETE SET NULL
                )
            `
        ]);

        console.log('Test database setup complete');
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }
}

export async function cleanupTestDatabase() {
    try {
        console.log('Cleaning up test database...');
        
        // Drop all test data using raw queries
        await prisma.$transaction([
            prisma.$executeRaw`DROP TABLE IF EXISTS "LockLike" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "VoteOption" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "VoteQuestion" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "Post" CASCADE`,
            prisma.$executeRaw`DROP TABLE IF EXISTS "ProcessedTransaction" CASCADE`
        ]);

        await prisma.$disconnect();
        console.log('Test database cleanup complete');
    } catch (error) {
        console.error('Error cleaning up test database:', error);
        throw error;
    }
}

export async function createTestData() {
    try {
        console.log('Creating test data...');
        
        await prisma.$transaction(async (tx) => {
            // Create test transaction
            const [processedTx] = await tx.$queryRaw<ProcessedTx[]>`
                INSERT INTO "ProcessedTransaction" (
                    "id", "txid", "blockHeight", "blockTime", "type", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid(), 'test_tx_1', 1000, CURRENT_TIMESTAMP, 'vote', 
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING "id", "txid", "blockHeight", "blockTime", "type"
            `;

            // Create test post
            const [post] = await tx.$queryRaw<Post[]>`
                INSERT INTO "Post" (
                    "id", "postId", "type", "content", "blockTime", "sequence", "parentSequence", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid(), 'test_post_1', 'vote', '{"question": "Test Question?"}'::jsonb,
                    CURRENT_TIMESTAMP, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING "id", "postId", "type", "content", "blockTime", "sequence"
            `;

            // Create test vote question
            const [voteQuestion] = await tx.$queryRaw<VoteQuestion[]>`
                INSERT INTO "VoteQuestion" (
                    "id", "postId", "question", "totalOptions", "optionsHash", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid(), ${post.postId}, 'Test Question?', 2, 'test_hash',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING "id", "postId", "question", "totalOptions", "optionsHash"
            `;

            // Create test vote options
            for (let i = 0; i < 2; i++) {
                const [voteOption] = await tx.$queryRaw<VoteOption[]>`
                    INSERT INTO "VoteOption" (
                        "id", "postId", "voteQuestionId", "index", "content", "createdAt", "updatedAt"
                    ) VALUES (
                        gen_random_uuid(), ${post.postId}, ${voteQuestion.id}, ${i}, 
                        ${`Option ${i + 1}`}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING "id", "postId", "voteQuestionId", "index", "content"
                `;

                // Create test lock like
                await tx.$queryRaw`
                    INSERT INTO "LockLike" (
                        "id", "txid", "postId", "voteOptionId", "lockAmount", "lockDuration", 
                        "isProcessed", "createdAt", "updatedAt"
                    ) VALUES (
                        gen_random_uuid(), ${processedTx.txid}, ${post.postId}, ${voteOption.id},
                        1000000, 144, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                `;
            }
        });

        console.log('Test data creation complete');
    } catch (error) {
        console.error('Error creating test data:', error);
        throw error;
    }
}
