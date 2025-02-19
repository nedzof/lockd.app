-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteQuestion" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoteQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteOption" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "voteQuestionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockLike" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "lockAmount" INTEGER NOT NULL,
    "lockDuration" INTEGER NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postId" TEXT,
    "voteOptionId" TEXT,

    CONSTRAINT "LockLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_postId_key" ON "Post"("postId");

-- CreateIndex
CREATE INDEX "Post_postId_idx" ON "Post"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteQuestion_postId_key" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "VoteQuestion_postId_idx" ON "VoteQuestion"("postId");

-- CreateIndex
CREATE INDEX "VoteOption_voteQuestionId_idx" ON "VoteOption"("voteQuestionId");

-- CreateIndex
CREATE INDEX "VoteOption_postId_idx" ON "VoteOption"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteOption_voteQuestionId_index_key" ON "VoteOption"("voteQuestionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "LockLike_txid_key" ON "LockLike"("txid");

-- CreateIndex
CREATE INDEX "LockLike_createdAt_idx" ON "LockLike"("createdAt");

-- CreateIndex
CREATE INDEX "LockLike_postId_idx" ON "LockLike"("postId");

-- CreateIndex
CREATE INDEX "LockLike_voteOptionId_idx" ON "LockLike"("voteOptionId");

-- CreateIndex
CREATE INDEX "LockLike_isProcessed_idx" ON "LockLike"("isProcessed");

-- AddForeignKey
ALTER TABLE "VoteQuestion" ADD CONSTRAINT "VoteQuestion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_voteQuestionId_fkey" FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_voteOptionId_fkey" FOREIGN KEY ("voteOptionId") REFERENCES "VoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
