-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "senderAddress" TEXT,
    "blockHeight" INTEGER,
    "txid" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteQuestion" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',

    CONSTRAINT "VoteQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteOption" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "postId" TEXT NOT NULL,
    "voteQuestionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',

    CONSTRAINT "VoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockLike" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "txid" TEXT NOT NULL,
    "lockAmount" INTEGER NOT NULL,
    "lockDuration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,

    CONSTRAINT "LockLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedTransaction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "txid" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
CREATE INDEX "Post_txid_idx" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_senderAddress_idx" ON "Post"("senderAddress");

-- CreateIndex
CREATE INDEX "Post_blockHeight_idx" ON "Post"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX "VoteQuestion_postId_key" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "VoteOption_voteQuestionId_idx" ON "VoteOption"("voteQuestionId");

-- CreateIndex
CREATE INDEX "VoteOption_postId_idx" ON "VoteOption"("postId");

-- CreateIndex
CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedTransaction_txid_key" ON "ProcessedTransaction"("txid");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_txid_idx" ON "ProcessedTransaction"("txid");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_type_idx" ON "ProcessedTransaction"("type");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_protocol_idx" ON "ProcessedTransaction"("protocol");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_blockHeight_idx" ON "ProcessedTransaction"("blockHeight");

-- AddForeignKey
ALTER TABLE "VoteQuestion" ADD CONSTRAINT "VoteQuestion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_voteQuestionId_fkey" FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
