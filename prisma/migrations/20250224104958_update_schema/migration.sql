/*
  Warnings:

  - You are about to drop the column `createdAt` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `lockAmount` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `lockDuration` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `blockHeight` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `blockTime` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `parentSequence` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `protocol` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `senderAddress` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `sequence` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the column `index` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the column `protocol` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the column `voteQuestionId` on the `VoteOption` table. All the data in the column will be lost.
  - You are about to drop the `VoteQuestion` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[txid]` on the table `LockLike` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[txid]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[txid]` on the table `VoteOption` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `post_id` to the `LockLike` table without a default value. This is not possible if the table is not empty.
  - Made the column `txid` on table `Post` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `post_id` to the `VoteOption` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txid` to the `VoteOption` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "LockLike" DROP CONSTRAINT "LockLike_postId_fkey";

-- DropForeignKey
ALTER TABLE "VoteOption" DROP CONSTRAINT "VoteOption_postId_fkey";

-- DropForeignKey
ALTER TABLE "VoteOption" DROP CONSTRAINT "VoteOption_voteQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "VoteQuestion" DROP CONSTRAINT "VoteQuestion_postId_fkey";

-- DropIndex
DROP INDEX "LockLike_postId_idx";

-- DropIndex
DROP INDEX "Post_blockHeight_idx";

-- DropIndex
DROP INDEX "Post_postId_idx";

-- DropIndex
DROP INDEX "Post_postId_key";

-- DropIndex
DROP INDEX "Post_senderAddress_idx";

-- DropIndex
DROP INDEX "VoteOption_postId_idx";

-- DropIndex
DROP INDEX "VoteOption_voteQuestionId_idx";

-- AlterTable
ALTER TABLE "LockLike" DROP COLUMN "createdAt",
DROP COLUMN "lockAmount",
DROP COLUMN "lockDuration",
DROP COLUMN "postId",
DROP COLUMN "updatedAt",
ADD COLUMN     "amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "author_address" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lock_duration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "post_id" TEXT NOT NULL,
ADD COLUMN     "unlock_height" INTEGER;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "blockHeight",
DROP COLUMN "blockTime",
DROP COLUMN "createdAt",
DROP COLUMN "image",
DROP COLUMN "parentSequence",
DROP COLUMN "postId",
DROP COLUMN "protocol",
DROP COLUMN "senderAddress",
DROP COLUMN "sequence",
DROP COLUMN "type",
DROP COLUMN "updatedAt",
ADD COLUMN     "author_address" TEXT,
ADD COLUMN     "block_height" INTEGER,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_vote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lock_duration" INTEGER,
ADD COLUMN     "media_type" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "raw_image_data" BYTEA,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unlock_height" INTEGER,
ALTER COLUMN "content" SET DATA TYPE TEXT,
ALTER COLUMN "txid" SET NOT NULL;

-- AlterTable
ALTER TABLE "VoteOption" DROP COLUMN "createdAt",
DROP COLUMN "index",
DROP COLUMN "postId",
DROP COLUMN "protocol",
DROP COLUMN "updatedAt",
DROP COLUMN "voteQuestionId",
ADD COLUMN     "author_address" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lock_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lock_duration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "post_id" TEXT NOT NULL,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "txid" TEXT NOT NULL,
ADD COLUMN     "unlock_height" INTEGER;

-- DropTable
DROP TABLE "VoteQuestion";

-- CreateIndex
CREATE UNIQUE INDEX "LockLike_txid_key" ON "LockLike"("txid");

-- CreateIndex
CREATE INDEX "LockLike_txid_idx" ON "LockLike"("txid");

-- CreateIndex
CREATE INDEX "LockLike_post_id_idx" ON "LockLike"("post_id");

-- CreateIndex
CREATE INDEX "LockLike_author_address_idx" ON "LockLike"("author_address");

-- CreateIndex
CREATE UNIQUE INDEX "Post_txid_key" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_author_address_idx" ON "Post"("author_address");

-- CreateIndex
CREATE INDEX "Post_block_height_idx" ON "Post"("block_height");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "VoteOption_txid_key" ON "VoteOption"("txid");

-- CreateIndex
CREATE INDEX "VoteOption_txid_idx" ON "VoteOption"("txid");

-- CreateIndex
CREATE INDEX "VoteOption_post_id_idx" ON "VoteOption"("post_id");

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
