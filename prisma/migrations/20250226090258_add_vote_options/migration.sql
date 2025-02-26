/*
  Warnings:

  - You are about to drop the column `block_height` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `is_locked` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `lock_duration` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `unlock_height` on the `Post` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "LockLike_txid_idx";

-- DropIndex
DROP INDEX "Post_block_height_idx";

-- DropIndex
DROP INDEX "Post_created_at_id_idx";

-- DropIndex
DROP INDEX "Post_is_locked_created_at_idx";

-- AlterTable
ALTER TABLE "LockLike" ADD COLUMN     "vote_option_id" TEXT,
ALTER COLUMN "amount" DROP DEFAULT,
ALTER COLUMN "lock_duration" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "block_height",
DROP COLUMN "description",
DROP COLUMN "is_locked",
DROP COLUMN "lock_duration",
DROP COLUMN "metadata",
DROP COLUMN "unlock_height",
ADD COLUMN     "media_url" TEXT,
ALTER COLUMN "raw_image_data" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "LockLike_created_at_idx" ON "LockLike"("created_at");

-- CreateIndex
CREATE INDEX "LockLike_vote_option_id_idx" ON "LockLike"("vote_option_id");

-- CreateIndex
CREATE INDEX "Post_tags_idx" ON "Post"("tags");

-- CreateIndex
CREATE INDEX "VoteOption_created_at_idx" ON "VoteOption"("created_at");

-- AddForeignKey
ALTER TABLE "LockLike" ADD CONSTRAINT "LockLike_vote_option_id_fkey" FOREIGN KEY ("vote_option_id") REFERENCES "VoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
