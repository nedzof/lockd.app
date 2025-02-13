-- Add vote question fields to Post table
ALTER TABLE "Post" ADD COLUMN "is_vote_question" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "question_content" TEXT; 