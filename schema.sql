-- Create votes table for upvotes (if not exists)
CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prediction_market_data JSONB,
    end_date TIMESTAMPTZ,
    locklike_id TEXT REFERENCES "LockLike"(txid) ON DELETE CASCADE
);

-- Create base prediction_market_options table if not exists
CREATE TABLE IF NOT EXISTS prediction_market_options (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alter prediction_market_options table
ALTER TABLE prediction_market_options
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS vote_id TEXT,
ADD COLUMN IF NOT EXISTS voter_address TEXT REFERENCES "Bitcoiner"(address) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS vote_count INT NOT NULL DEFAULT 0;

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'prediction_market_options_vote_id_fkey'
    ) THEN
        ALTER TABLE prediction_market_options
        ADD CONSTRAINT prediction_market_options_vote_id_fkey 
        FOREIGN KEY (vote_id) REFERENCES votes(id) ON DELETE CASCADE;
    END IF;

    -- Add unique constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'prediction_market_options_vote_title_unique'
    ) THEN
        ALTER TABLE prediction_market_options
        ADD CONSTRAINT prediction_market_options_vote_title_unique 
        UNIQUE(vote_id, title);
    END IF;
END$$;

-- Update title to NOT NULL if not already
ALTER TABLE prediction_market_options 
ALTER COLUMN title SET NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_votes_post_id ON votes(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_prediction_market_data ON votes USING gin (prediction_market_data);
CREATE INDEX IF NOT EXISTS idx_votes_locklike_id ON votes(locklike_id);
CREATE INDEX IF NOT EXISTS idx_prediction_market_options_vote_id ON prediction_market_options(vote_id);
CREATE INDEX IF NOT EXISTS idx_prediction_market_options_voter_address ON prediction_market_options(voter_address);
CREATE INDEX IF NOT EXISTS idx_prediction_market_options_vote_count ON prediction_market_options(vote_count);

-- Function to maintain vote count
CREATE OR REPLACE FUNCTION update_post_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "Post" SET vote_count = vote_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE "Post" SET vote_count = vote_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_post_vote_count_trigger ON votes;

-- Create trigger
CREATE TRIGGER update_post_vote_count_trigger
AFTER INSERT OR DELETE ON votes
FOR EACH ROW
EXECUTE FUNCTION update_post_vote_count();