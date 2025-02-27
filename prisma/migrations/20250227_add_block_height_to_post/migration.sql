-- Add block_height column to Post table
ALTER TABLE "Post" ADD COLUMN "block_height" INTEGER;

-- Create an index on block_height for better query performance
CREATE INDEX "Post_block_height_idx" ON "Post"("block_height");
