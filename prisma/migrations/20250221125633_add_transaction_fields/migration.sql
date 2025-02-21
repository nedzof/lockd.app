-- First add nullable columns
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "txid" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "blockHeight" INTEGER;

-- Add columns to ProcessedTransaction
ALTER TABLE "ProcessedTransaction" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'unknown';
ALTER TABLE "ProcessedTransaction" ADD COLUMN IF NOT EXISTS "protocol" TEXT DEFAULT 'MAP';

-- Update existing Post records to use postId as txid
UPDATE "Post" SET "txid" = "postId" WHERE "txid" IS NULL;

-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "txid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProcessedTransaction" ALTER COLUMN "type" SET DEFAULT 'unknown';

-- Add indexes
CREATE INDEX IF NOT EXISTS "Post_txid_idx" ON "Post"("txid");
CREATE INDEX IF NOT EXISTS "Post_blockHeight_idx" ON "Post"("blockHeight");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_type_idx" ON "ProcessedTransaction"("type");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_protocol_idx" ON "ProcessedTransaction"("protocol");
CREATE INDEX IF NOT EXISTS "ProcessedTransaction_blockHeight_idx" ON "ProcessedTransaction"("blockHeight");
