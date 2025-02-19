-- Create tables based on Prisma schema
CREATE TABLE IF NOT EXISTS "Post" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "content" JSONB NOT NULL,
    "timestamp" TIMESTAMP NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "VoteQuestion" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "VoteOption" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    UNIQUE("voteQuestionId", "index"),
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
    FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "LockLike" (
    "id" TEXT PRIMARY KEY,
    "txid" TEXT UNIQUE NOT NULL,
    "amount" INTEGER NOT NULL,
    "lockPeriod" INTEGER NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "postId" UUID,
    "voteOptionId" UUID,
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL,
    FOREIGN KEY ("voteOptionId") REFERENCES "VoteOption"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "ProcessedTransaction" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "txid" TEXT UNIQUE NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "Post_postId_idx" ON "Post"("postId");
CREATE INDEX IF NOT EXISTS "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");
CREATE INDEX IF NOT EXISTS "VoteOption_voteQuestionId_idx" ON "VoteOption"("voteQuestionId");
CREATE INDEX IF NOT EXISTS "VoteOption_postId_idx" ON "VoteOption"("postId");
CREATE INDEX IF NOT EXISTS "LockLike_createdAt_idx" ON "LockLike"("createdAt");
CREATE INDEX IF NOT EXISTS "LockLike_postId_idx" ON "LockLike"("postId");
CREATE INDEX IF NOT EXISTS "LockLike_voteOptionId_idx" ON "LockLike"("voteOptionId");
CREATE INDEX IF NOT EXISTS "LockLike_isProcessed_idx" ON "LockLike"("isProcessed");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_txid_idx" ON "ProcessedTransaction"("txid");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_timestamp_idx" ON "ProcessedTransaction"("timestamp");
