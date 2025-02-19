-- Drop existing tables to recreate them with correct schema
DROP TABLE IF EXISTS "LockLike" CASCADE;
DROP TABLE IF EXISTS "VoteOption" CASCADE;
DROP TABLE IF EXISTS "VoteQuestion" CASCADE;
DROP TABLE IF EXISTS "Post" CASCADE;
DROP TABLE IF EXISTS "ProcessedTransaction" CASCADE;

-- Create tables with correct schema
CREATE TABLE "Post" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "content" JSONB NOT NULL,
    "timestamp" TIMESTAMP NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "VoteQuestion" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
);

CREATE TABLE "VoteOption" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("voteQuestionId", "index"),
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
    FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
);

CREATE TABLE "LockLike" (
    "id" TEXT PRIMARY KEY,
    "txid" TEXT UNIQUE NOT NULL,
    "amount" INTEGER NOT NULL,
    "lockPeriod" INTEGER NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" UUID,
    "voteOptionId" UUID,
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL,
    FOREIGN KEY ("voteOptionId") REFERENCES "VoteOption"("id") ON DELETE SET NULL
);

CREATE TABLE "ProcessedTransaction" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "txid" TEXT UNIQUE NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX "Post_postId_idx" ON "Post"("postId");
CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");
CREATE INDEX "VoteOption_voteQuestionId_idx" ON "VoteOption"("voteQuestionId");
CREATE INDEX "VoteOption_postId_idx" ON "VoteOption"("postId");
CREATE INDEX "LockLike_createdAt_idx" ON "LockLike"("createdAt");
CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");
CREATE INDEX "LockLike_voteOptionId_idx" ON "LockLike"("voteOptionId");
CREATE INDEX "LockLike_isProcessed_idx" ON "LockLike"("isProcessed");
CREATE INDEX "ProcessedTransaction_txid_idx" ON "ProcessedTransaction"("txid");
CREATE INDEX "ProcessedTransaction_timestamp_idx" ON "ProcessedTransaction"("timestamp");
