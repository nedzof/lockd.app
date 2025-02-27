-- Add is_locked column to Post table
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;
