-- CreateTable
CREATE TABLE "transaction" (
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

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_options" (
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

    CONSTRAINT "vote_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_txid_key" ON "transaction"("txid");

-- CreateIndex
CREATE INDEX "transaction_author_address_idx" ON "transaction"("author_address");

-- CreateIndex
CREATE INDEX "transaction_created_at_idx" ON "transaction"("created_at");

-- CreateIndex
CREATE INDEX "transaction_block_height_idx" ON "transaction"("block_height");

-- CreateIndex
CREATE UNIQUE INDEX "vote_options_txid_key" ON "vote_options"("txid");

-- CreateIndex
CREATE INDEX "vote_options_post_txid_idx" ON "vote_options"("post_txid");

-- AddForeignKey
ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_post_txid_fkey" FOREIGN KEY ("post_txid") REFERENCES "transaction"("txid") ON DELETE RESTRICT ON UPDATE CASCADE;
