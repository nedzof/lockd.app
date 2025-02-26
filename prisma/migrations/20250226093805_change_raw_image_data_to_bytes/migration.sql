/*
  Warnings:

  - The `raw_image_data` column on the `Post` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Post" DROP COLUMN "raw_image_data",
ADD COLUMN     "raw_image_data" BYTEA;
