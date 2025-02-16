/*
  Warnings:

  - You are about to drop the `LockLike` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VoteOption` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."LockLike" DROP CONSTRAINT "LockLike_post_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."LockLike" DROP CONSTRAINT "LockLike_vote_option_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."VoteOption" DROP CONSTRAINT "VoteOption_post_txid_fkey";

-- DropTable
DROP TABLE "public"."LockLike";

-- DropTable
DROP TABLE "public"."Post";

-- DropTable
DROP TABLE "public"."VoteOption";

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "media_type" TEXT,
    "block_height" INTEGER,
    "amount" INTEGER,
    "unlock_height" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[],
    "metadata" JSONB,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "lock_duration" INTEGER,
    "raw_image_data" BYTEA,
    "image_format" TEXT,
    "image_source" TEXT,
    "is_vote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteOption" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "post_txid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "lock_amount" INTEGER NOT NULL,
    "lock_duration" INTEGER NOT NULL,
    "unlock_height" INTEGER NOT NULL,
    "current_height" INTEGER NOT NULL,
    "lock_percentage" DOUBLE PRECISION NOT NULL,
    "option_index" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[],

    CONSTRAINT "VoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockLike" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "handle" TEXT NOT NULL,
    "lockPeriod" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "post_id" TEXT,
    "vote_option_id" TEXT,

    CONSTRAINT "LockLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_txid_key" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_author_address_idx" ON "Post"("author_address");

-- CreateIndex
CREATE INDEX "Post_block_height_idx" ON "Post"("block_height");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE INDEX "Post_postId_idx" ON "Post"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteOption_txid_key" ON "VoteOption"("txid");

-- CreateIndex
CREATE INDEX "VoteOption_postId_idx" ON "VoteOption"("postId");

-- CreateIndex
CREATE INDEX "VoteOption_post_txid_idx" ON "VoteOption"("post_txid");

-- CreateIndex
CREATE UNIQUE INDEX "LockLike_txid_key" ON "LockLike"("txid");

-- CreateIndex
CREATE INDEX "LockLike_handle_idx" ON "LockLike"("handle");

-- CreateIndex
CREATE INDEX "LockLike_created_at_idx" ON "LockLike"("created_at");

-- CreateIndex
CREATE INDEX "LockLike_post_id_idx" ON "LockLike"("post_id");

-- CreateIndex
CREATE INDEX "LockLike_vote_option_id_idx" ON "LockLike"("vote_option_id");

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_post_txid_fkey" FOREIGN KEY ("post_txid") REFERENCES "Post"("txid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_vote_option_id_fkey" FOREIGN KEY ("vote_option_id") REFERENCES "VoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
