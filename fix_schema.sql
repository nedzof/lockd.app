-- Drop existing tables to recreate them with correct schema
DROP TABLE IF EXISTS "LockLike" CASCADE;
DROP TABLE IF EXISTS "vote_option" CASCADE;
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
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "VoteQuestion" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
);

CREATE TABLE "vote_option" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("voteQuestionId", "index"),
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
    FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
);

CREATE TABLE "LockLike" (
    "id" TEXT PRIMARY KEY,
    "tx_id" TEXT UNIQUE NOT NULL,
    "amount" INTEGER NOT NULL,
    "lockPeriod" INTEGER NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" UUID,
    "vote_option_id" UUID,
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL,
    FOREIGN KEY ("vote_option_id") REFERENCES "vote_option"("id") ON DELETE SET NULL
);

CREATE TABLE "ProcessedTransaction" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tx_id" TEXT UNIQUE NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX "Post_postId_idx" ON "Post"("postId");
CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");
CREATE INDEX "vote_option_voteQuestionId_idx" ON "vote_option"("voteQuestionId");
CREATE INDEX "vote_option_postId_idx" ON "vote_option"("postId");
CREATE INDEX "LockLike_created_at_idx" ON "LockLike"("created_at");
CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");
CREATE INDEX "LockLike_vote_option_id_idx" ON "LockLike"("vote_option_id");
CREATE INDEX "LockLike_isProcessed_idx" ON "LockLike"("isProcessed");
CREATE INDEX "ProcessedTransaction_tx_id_idx" ON "ProcessedTransaction"("tx_id");
CREATE INDEX "ProcessedTransaction_timestamp_idx" ON "ProcessedTransaction"("timestamp");
