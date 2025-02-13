/*
  Warnings:

  - You are about to drop the `post` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `voteOptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."voteOptions" DROP CONSTRAINT "voteOptions_post_txid_fkey";

-- DropTable
DROP TABLE "public"."post";

-- DropTable
DROP TABLE "public"."voteOptions";

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "media_type" TEXT,
    "block_height" INTEGER NOT NULL,
    "amount" INTEGER,
    "unlock_height" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[],
    "metadata" JSONB,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "lock_duration" INTEGER,
    "raw_image_data" TEXT,
    "image_format" TEXT,
    "image_source" TEXT,
    "is_vote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteOption" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "post_txid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "lock_amount" INTEGER NOT NULL,
    "lock_duration" INTEGER NOT NULL,
    "unlock_height" INTEGER NOT NULL,
    "current_height" INTEGER NOT NULL,
    "lock_percentage" DOUBLE PRECISION NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "VoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_txid_key" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_author_address_idx" ON "Post"("author_address");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE INDEX "Post_block_height_idx" ON "Post"("block_height");

-- CreateIndex
CREATE UNIQUE INDEX "VoteOption_txid_key" ON "VoteOption"("txid");

-- CreateIndex
CREATE INDEX "VoteOption_post_txid_idx" ON "VoteOption"("post_txid");

-- AddForeignKey
ALTER TABLE "VoteOption" ADD CONSTRAINT "VoteOption_post_txid_fkey" FOREIGN KEY ("post_txid") REFERENCES "Post"("txid") ON DELETE RESTRICT ON UPDATE CASCADE;
