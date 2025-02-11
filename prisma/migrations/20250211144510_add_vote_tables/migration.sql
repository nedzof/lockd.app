/*
  Warnings:

  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."Post";

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

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_questions" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "options" JSONB NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "vote_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_options" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "question_txid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "lock_amount" INTEGER NOT NULL,
    "lock_duration" INTEGER NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "vote_options_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "vote_questions_txid_key" ON "vote_questions"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "vote_options_txid_key" ON "vote_options"("txid");

-- AddForeignKey
ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_question_txid_fkey" FOREIGN KEY ("question_txid") REFERENCES "vote_questions"("txid") ON DELETE RESTRICT ON UPDATE CASCADE;
