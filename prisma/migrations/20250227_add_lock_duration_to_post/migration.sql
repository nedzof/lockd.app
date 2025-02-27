-- Add lock_duration column to Post table
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "lock_duration" INTEGER;
