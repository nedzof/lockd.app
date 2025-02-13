/*
  Warnings:

  - You are about to drop the `transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `voteOptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."voteOptions" DROP CONSTRAINT "voteOptions_post_txid_fkey";

-- DropTable
DROP TABLE "public"."transaction";

-- DropTable
DROP TABLE "public"."voteOptions";

-- CreateTable
CREATE TABLE "post" (
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

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voteOptions" (
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

    CONSTRAINT "voteOptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_txid_key" ON "post"("txid");

-- CreateIndex
CREATE INDEX "post_author_address_idx" ON "post"("author_address");

-- CreateIndex
CREATE INDEX "post_created_at_idx" ON "post"("created_at");

-- CreateIndex
CREATE INDEX "post_block_height_idx" ON "post"("block_height");

-- CreateIndex
CREATE UNIQUE INDEX "voteOptions_txid_key" ON "voteOptions"("txid");

-- CreateIndex
CREATE INDEX "voteOptions_post_txid_idx" ON "voteOptions"("post_txid");

-- AddForeignKey
ALTER TABLE "voteOptions" ADD CONSTRAINT "voteOptions_post_txid_fkey" FOREIGN KEY ("post_txid") REFERENCES "post"("txid") ON DELETE RESTRICT ON UPDATE CASCADE;
