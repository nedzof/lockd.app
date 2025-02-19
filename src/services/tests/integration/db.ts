import { Pool, PoolClient } from 'pg';

const pool = new Pool({
    user: 'postgres.aqqxfcazqwjuyjjmuuxn',
    password: 'A4A8ZEe7PFyK9oHq',
    host: 'aws-0-eu-central-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    ssl: process.env.NODE_ENV === 'production',
    statement_timeout: 10000
});

export async function getTestClient(): Promise<PoolClient> {
    return await pool.connect();
}

export async function cleanupDatabase() {
    const client = await pool.connect();
    try {
        // Drop all tables
        await client.query('DROP TABLE IF EXISTS "LockLike" CASCADE');
        await client.query('DROP TABLE IF EXISTS "VoteOption" CASCADE');
        await client.query('DROP TABLE IF EXISTS "VoteQuestion" CASCADE');
        await client.query('DROP TABLE IF EXISTS "Post" CASCADE');
        await client.query('DROP TABLE IF EXISTS "ProcessedTransaction" CASCADE');

        // Recreate tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Post" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                "postId" TEXT UNIQUE NOT NULL,
                "type" TEXT NOT NULL,
                "protocol" TEXT NOT NULL DEFAULT 'MAP',
                "content" JSONB NOT NULL,
                "blockTime" TIMESTAMP(3) NOT NULL,
                "sequence" INTEGER NOT NULL,
                "parentSequence" INTEGER NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS "VoteQuestion" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                "postId" TEXT UNIQUE NOT NULL,
                "question" TEXT NOT NULL,
                "totalOptions" INTEGER NOT NULL,
                "optionsHash" TEXT NOT NULL,
                "protocol" TEXT NOT NULL DEFAULT 'MAP',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "VoteOption" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                "postId" TEXT NOT NULL,
                "voteQuestionId" TEXT NOT NULL,
                "index" INTEGER NOT NULL,
                "content" TEXT NOT NULL,
                "protocol" TEXT NOT NULL DEFAULT 'MAP',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
                FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "LockLike" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                "postId" TEXT NOT NULL,
                "txid" TEXT NOT NULL,
                "lockAmount" INTEGER NOT NULL,
                "lockDuration" INTEGER NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "ProcessedTransaction" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                "txid" TEXT UNIQUE NOT NULL,
                "blockHeight" INTEGER NOT NULL,
                "blockTime" TIMESTAMP(3) NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX "Post_postId_idx" ON "Post"("postId");
            CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");
            CREATE INDEX "VoteOption_postId_idx" ON "VoteOption"("postId");
            CREATE INDEX "VoteOption_voteQuestionId_idx" ON "VoteOption"("voteQuestionId");
            CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");
            CREATE INDEX "ProcessedTransaction_txid_idx" ON "ProcessedTransaction"("txid");
        `);
    } finally {
        client.release();
    }
}

export async function closeConnection() {
    await pool.end();
}
