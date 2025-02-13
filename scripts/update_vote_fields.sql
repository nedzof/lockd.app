-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Add unlock_height column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vote_options' AND column_name = 'unlock_height') THEN
        ALTER TABLE vote_options ADD COLUMN unlock_height INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Add current_height column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vote_options' AND column_name = 'current_height') THEN
        ALTER TABLE vote_options ADD COLUMN current_height INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Add lock_percentage column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vote_options' AND column_name = 'lock_percentage') THEN
        ALTER TABLE vote_options ADD COLUMN lock_percentage FLOAT NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Update question_content from content where appropriate
UPDATE "Post"
SET question_content = content
WHERE is_vote = true 
  AND is_vote_question = true 
  AND (question_content IS NULL OR question_content = ''); 