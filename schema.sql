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
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "VoteQuestion" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT UNIQUE NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "vote_option" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    UNIQUE("voteQuestionId", "index"),
    FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE,
    FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "LockLike" (
    "id" TEXT PRIMARY KEY,
    "tx_id" TEXT UNIQUE NOT NULL,
    "amount" INTEGER NOT NULL,
    "lockPeriod" INTEGER NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "postId" UUID,
    "vote_option_id" UUID,
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL,
    FOREIGN KEY ("vote_option_id") REFERENCES "vote_option"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "ProcessedTransaction" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tx_id" TEXT UNIQUE NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "Post_postId_idx" ON "Post"("postId");
CREATE INDEX IF NOT EXISTS "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");
CREATE INDEX IF NOT EXISTS "vote_option_voteQuestionId_idx" ON "vote_option"("voteQuestionId");
CREATE INDEX IF NOT EXISTS "vote_option_postId_idx" ON "vote_option"("postId");
CREATE INDEX IF NOT EXISTS "LockLike_created_at_idx" ON "LockLike"("created_at");
CREATE INDEX IF NOT EXISTS "LockLike_postId_idx" ON "LockLike"("postId");
CREATE INDEX IF NOT EXISTS "LockLike_vote_option_id_idx" ON "LockLike"("vote_option_id");
CREATE INDEX IF NOT EXISTS "LockLike_isProcessed_idx" ON "LockLike"("isProcessed");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_tx_id_idx" ON "ProcessedTransaction"("tx_id");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_timestamp_idx" ON "ProcessedTransaction"("timestamp");
