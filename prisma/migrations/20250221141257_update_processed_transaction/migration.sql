/*
  Warnings:

  - You are about to drop the column `content` on the `ProcessedTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `lockAmount` on the `ProcessedTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `lockDuration` on the `ProcessedTransaction` table. All the data in the column will be lost.
  - The `blockTime` column on the `ProcessedTransaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ProcessedTransaction" ADD COLUMN "metadata" JSONB;

UPDATE "ProcessedTransaction"
SET "metadata" = jsonb_build_object(
    'postId', COALESCE((content->>'postId'), txid),
    'content', COALESCE((content->>'content'), ''),
    'lockAmount', COALESCE("lockAmount", 0),
    'lockDuration', COALESCE("lockDuration", 0)
);

ALTER TABLE "ProcessedTransaction" ALTER COLUMN "metadata" SET NOT NULL;

ALTER TABLE "ProcessedTransaction" 
    ADD COLUMN "blockTime_new" INTEGER NOT NULL DEFAULT 0;

UPDATE "ProcessedTransaction" 
SET "blockTime_new" = EXTRACT(EPOCH FROM "blockTime")::INTEGER;

ALTER TABLE "ProcessedTransaction" DROP COLUMN "blockTime";
ALTER TABLE "ProcessedTransaction" ALTER COLUMN "blockTime_new" SET DEFAULT 0;
ALTER TABLE "ProcessedTransaction" RENAME COLUMN "blockTime_new" TO "blockTime";

ALTER TABLE "ProcessedTransaction" ALTER COLUMN "blockHeight" SET DEFAULT 0;

ALTER TABLE "ProcessedTransaction" DROP COLUMN "content";
ALTER TABLE "ProcessedTransaction" DROP COLUMN "lockAmount";
ALTER TABLE "ProcessedTransaction" DROP COLUMN "lockDuration";
