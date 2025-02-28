-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentSequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "senderAddress" TEXT,
    "blockHeight" INTEGER,
    "tx_id" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteQuestion" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',

    CONSTRAINT "VoteQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_option" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',

    CONSTRAINT "vote_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockLike" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tx_id" TEXT NOT NULL,
    "lockAmount" INTEGER NOT NULL,
    "lockDuration" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,

    CONSTRAINT "LockLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedTransaction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tx_id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "type" TEXT NOT NULL DEFAULT 'unknown',
    "content" JSONB,
    "lockAmount" INTEGER,
    "lockDuration" INTEGER,

    CONSTRAINT "ProcessedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_postId_key" ON "Post"("postId");

-- CreateIndex
CREATE INDEX "Post_postId_idx" ON "Post"("postId");

-- CreateIndex
CREATE INDEX "Post_tx_id_idx" ON "Post"("tx_id");

-- CreateIndex
CREATE INDEX "Post_senderAddress_idx" ON "Post"("senderAddress");

-- CreateIndex
CREATE INDEX "Post_blockHeight_idx" ON "Post"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX "VoteQuestion_postId_key" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "vote_option_voteQuestionId_idx" ON "vote_option"("voteQuestionId");

-- CreateIndex
CREATE INDEX "vote_option_postId_idx" ON "vote_option"("postId");

-- CreateIndex
CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedTransaction_tx_id_key" ON "ProcessedTransaction"("tx_id");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_tx_id_idx" ON "ProcessedTransaction"("tx_id");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_type_idx" ON "ProcessedTransaction"("type");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_protocol_idx" ON "ProcessedTransaction"("protocol");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_blockHeight_idx" ON "ProcessedTransaction"("blockHeight");

-- AddForeignKey
ALTER TABLE "VoteQuestion" ADD CONSTRAINT "VoteQuestion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vote_option" ADD CONSTRAINT "vote_option_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vote_option" ADD CONSTRAINT "vote_option_voteQuestionId_fkey" FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
