-- Add new fields to VoteOption table
ALTER TABLE "vote_options" 
ADD COLUMN "unlock_height" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "current_height" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lock_percentage" FLOAT NOT NULL DEFAULT 0;

-- Update voting_question data from content where is_vote is true
UPDATE "Post"
SET "question_content" = "content"
WHERE "is_vote" = true AND "is_vote_question" = true; 