/*
  Warnings:

  - You are about to drop the column `created_at` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `lockAmount` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `lockDuration` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `LockLike` table. All the data in the column will be lost.
  - You are about to drop the column `blockHeight` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `blockTime` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `parentSequence` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `protocol` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `senderAddress` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `sequence` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the column `index` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the column `postId` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the column `protocol` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the column `voteQuestionId` on the `vote_option` table. All the data in the column will be lost.
  - You are about to drop the `VoteQuestion` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tx_id]` on the table `LockLike` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tx_id]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tx_id]` on the table `vote_option` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `post_id` to the `LockLike` table without a default value. This is not possible if the table is not empty.
  - Made the column `tx_id` on table `Post` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `post_id` to the `vote_option` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tx_id` to the `vote_option` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "LockLike" DROP CONSTRAINT "LockLike_postId_fkey";

-- DropForeignKey
ALTER TABLE "vote_option" DROP CONSTRAINT "vote_option_postId_fkey";

-- DropForeignKey
ALTER TABLE "vote_option" DROP CONSTRAINT "vote_option_voteQuestionId_fkey";

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
DROP INDEX "vote_option_postId_idx";

-- DropIndex
DROP INDEX "vote_option_voteQuestionId_idx";

-- AlterTable
ALTER TABLE "LockLike" DROP COLUMN "created_at",
DROP COLUMN "lockAmount",
DROP COLUMN "lockDuration",
DROP COLUMN "postId",
DROP COLUMN "updated_at",
ADD COLUMN     "amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "author_address" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lock_duration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "post_id" TEXT NOT NULL,
ADD COLUMN     "unlock_height" INTEGER;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "blockHeight",
DROP COLUMN "blockTime",
DROP COLUMN "created_at",
DROP COLUMN "image",
DROP COLUMN "parentSequence",
DROP COLUMN "postId",
DROP COLUMN "protocol",
DROP COLUMN "senderAddress",
DROP COLUMN "sequence",
DROP COLUMN "type",
DROP COLUMN "updated_at",
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
ALTER COLUMN "tx_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vote_option" DROP COLUMN "created_at",
DROP COLUMN "index",
DROP COLUMN "postId",
DROP COLUMN "protocol",
DROP COLUMN "updated_at",
DROP COLUMN "voteQuestionId",
ADD COLUMN     "author_address" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lock_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lock_duration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "post_id" TEXT NOT NULL,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tx_id" TEXT NOT NULL,
ADD COLUMN     "unlock_height" INTEGER;

-- DropTable
DROP TABLE "VoteQuestion";

-- CreateIndex
CREATE UNIQUE INDEX "LockLike_tx_id_key" ON "LockLike"("tx_id");

-- CreateIndex
CREATE INDEX "LockLike_tx_id_idx" ON "LockLike"("tx_id");

-- CreateIndex
CREATE INDEX "LockLike_post_id_idx" ON "LockLike"("post_id");

-- CreateIndex
CREATE INDEX "LockLike_author_address_idx" ON "LockLike"("author_address");

-- CreateIndex
CREATE UNIQUE INDEX "Post_tx_id_key" ON "Post"("tx_id");

-- CreateIndex
CREATE INDEX "Post_author_address_idx" ON "Post"("author_address");

-- CreateIndex
CREATE INDEX "Post_block_height_idx" ON "Post"("block_height");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vote_option_tx_id_key" ON "vote_option"("tx_id");

-- CreateIndex
CREATE INDEX "vote_option_tx_id_idx" ON "vote_option"("tx_id");

-- CreateIndex
CREATE INDEX "vote_option_post_id_idx" ON "vote_option"("post_id");

-- AddForeignKey
ALTER TABLE "vote_option" ADD CONSTRAINT "vote_option_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
