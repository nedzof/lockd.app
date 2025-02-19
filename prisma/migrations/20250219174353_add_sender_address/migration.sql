/*
  Warnings:

  - You are about to drop the column `isProcessed` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `voteOptionId` on the `LockLike` table. All the data in the column will be lost.
  - Made the column `postId` on table `LockLike` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "LockLike" DROP CONSTRAINT "LockLike_postId_fkey";

-- DropForeignKey
ALTER TABLE "LockLike" DROP CONSTRAINT "LockLike_voteOptionId_fkey";

-- DropForeignKey
ALTER TABLE "VoteOption" DROP CONSTRAINT "VoteOption_postId_fkey";

-- DropForeignKey
ALTER TABLE "VoteOption" DROP CONSTRAINT "VoteOption_voteQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "VoteQuestion" DROP CONSTRAINT "VoteQuestion_postId_fkey";

-- DropIndex
DROP INDEX "LockLike_createdAt_idx";

-- DropIndex
DROP INDEX "LockLike_isProcessed_idx";

-- DropIndex
DROP INDEX "LockLike_txid_key";

-- DropIndex
DROP INDEX "LockLike_voteOptionId_idx";

-- DropIndex
DROP INDEX "VoteOption_voteQuestionId_index_key";

-- AlterTable
ALTER TABLE "LockLike" DROP COLUMN "isProcessed",
DROP COLUMN "voteOptionId",
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "postId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'MAP',
ADD COLUMN     "senderAddress" TEXT,
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "VoteOption" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'MAP',
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "VoteQuestion" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'MAP',
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ProcessedTransaction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "txid" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedTransaction_txid_key" ON "ProcessedTransaction"("txid");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_txid_idx" ON "ProcessedTransaction"("txid");

-- CreateIndex
CREATE INDEX "Post_senderAddress_idx" ON "Post"("senderAddress");

-- AddForeignKey
ALTER TABLE "VoteQuestion" ADD CONSTRAINT "VoteQuestion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("postId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_voteQuestionId_fkey" FOREIGN KEY ("voteQuestionId") REFERENCES "VoteQuestion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
