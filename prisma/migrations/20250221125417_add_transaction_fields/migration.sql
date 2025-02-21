/*
  Warnings:

  - A unique constraint covering the columns `[txid]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `txid` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `ProcessedTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "blockHeight" INTEGER,
ADD COLUMN     "txid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProcessedTransaction" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'MAP',
ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Post_txid_key" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_txid_idx" ON "Post"("txid");

-- CreateIndex
CREATE INDEX "Post_blockHeight_idx" ON "Post"("blockHeight");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_type_idx" ON "ProcessedTransaction"("type");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_protocol_idx" ON "ProcessedTransaction"("protocol");

-- CreateIndex
CREATE INDEX "ProcessedTransaction_blockHeight_idx" ON "ProcessedTransaction"("blockHeight");
