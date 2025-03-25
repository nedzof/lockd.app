-- CreateTable
CREATE TABLE "lock_like" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tx_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "author_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "post_id" TEXT NOT NULL,
    "lock_height" INTEGER,
    "unlock_height" INTEGER,
    "vote_option_id" TEXT,

    CONSTRAINT "lock_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "content" TEXT NOT NULL,
    "tx_id" TEXT NOT NULL,
    "author_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_vote" BOOLEAN NOT NULL DEFAULT false,
    "media_type" TEXT,
    "content_type" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_url" TEXT,
    "raw_image_data" BYTEA,
    "block_height" INTEGER,
    "metadata" JSONB,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "image_metadata" JSONB,
    "scheduled_at" TIMESTAMP(3),

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_transaction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tx_id" TEXT NOT NULL,
    "block_height" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocol" TEXT NOT NULL DEFAULT 'MAP',
    "type" TEXT NOT NULL DEFAULT 'unknown',
    "metadata" JSONB NOT NULL,
    "block_time" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "processed_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'user_created',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_option" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "content" TEXT NOT NULL,
    "author_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "post_id" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tx_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vote_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsv_price_history" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsv_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "total_posts" INTEGER NOT NULL,
    "total_votes" INTEGER NOT NULL,
    "total_lock_likes" INTEGER NOT NULL,
    "total_users" INTEGER NOT NULL,
    "total_bsv_locked" DOUBLE PRECISION NOT NULL,
    "avg_lock_duration" DOUBLE PRECISION NOT NULL,
    "most_used_tag" TEXT,
    "most_active_user" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_bsv_price" DOUBLE PRECISION,

    CONSTRAINT "stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_subscription" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "wallet_address" TEXT NOT NULL,
    "session_id" TEXT,
    "threshold_value" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "subscription_data" JSONB,
    "endpoint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_notified_at" TIMESTAMP(3),

    CONSTRAINT "notification_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lock_like_tx_id_key" ON "lock_like"("tx_id");

-- CreateIndex
CREATE INDEX "lock_like_author_address_idx" ON "lock_like"("author_address");

-- CreateIndex
CREATE INDEX "lock_like_created_at_idx" ON "lock_like"("created_at");

-- CreateIndex
CREATE INDEX "lock_like_post_id_idx" ON "lock_like"("post_id");

-- CreateIndex
CREATE INDEX "lock_like_vote_option_id_idx" ON "lock_like"("vote_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_tx_id_key" ON "post"("tx_id");

-- CreateIndex
CREATE INDEX "post_author_address_idx" ON "post"("author_address");

-- CreateIndex
CREATE INDEX "post_block_height_idx" ON "post"("block_height");

-- CreateIndex
CREATE INDEX "post_created_at_idx" ON "post"("created_at");

-- CreateIndex
CREATE INDEX "post_tags_idx" ON "post"("tags");

-- CreateIndex
CREATE INDEX "post_tx_id_idx" ON "post"("tx_id");

-- CreateIndex
CREATE INDEX "post_schedule_at_idx" ON "post"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_transaction_tx_id_key" ON "processed_transaction"("tx_id");

-- CreateIndex
CREATE INDEX "processed_transaction_protocol_idx" ON "processed_transaction"("protocol");

-- CreateIndex
CREATE INDEX "processed_transaction_tx_id_idx" ON "processed_transaction"("tx_id");

-- CreateIndex
CREATE INDEX "processed_transaction_type_idx" ON "processed_transaction"("type");

-- CreateIndex
CREATE INDEX "processed_transaction_block_height_idx" ON "processed_transaction"("block_height");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE INDEX "tag_name_idx" ON "tag"("name");

-- CreateIndex
CREATE INDEX "tag_type_idx" ON "tag"("type");

-- CreateIndex
CREATE INDEX "tag_usage_count_idx" ON "tag"("usage_count");

-- CreateIndex
CREATE UNIQUE INDEX "vote_option_tx_id_key" ON "vote_option"("tx_id");

-- CreateIndex
CREATE INDEX "vote_option_created_at_idx" ON "vote_option"("created_at");

-- CreateIndex
CREATE INDEX "vote_option_option_index_idx" ON "vote_option"("option_index");

-- CreateIndex
CREATE INDEX "vote_option_post_id_idx" ON "vote_option"("post_id");

-- CreateIndex
CREATE INDEX "vote_option_tx_id_idx" ON "vote_option"("tx_id");

-- CreateIndex
CREATE UNIQUE INDEX "bsv_price_history_date_key" ON "bsv_price_history"("date");

-- CreateIndex
CREATE INDEX "notification_subscription_wallet_address_idx" ON "notification_subscription"("wallet_address");

-- CreateIndex
CREATE INDEX "notification_subscription_session_id_idx" ON "notification_subscription"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_subscription_wallet_address_endpoint_key" ON "notification_subscription"("wallet_address", "endpoint");

-- AddForeignKey
ALTER TABLE "lock_like" ADD CONSTRAINT "lock_like_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lock_like" ADD CONSTRAINT "lock_like_vote_option_id_fkey" FOREIGN KEY ("vote_option_id") REFERENCES "vote_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_option" ADD CONSTRAINT "vote_option_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
