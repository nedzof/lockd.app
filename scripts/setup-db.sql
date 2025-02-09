-- Drop views first
DROP VIEW IF EXISTS user_stats CASCADE;

-- Drop existing tables in the correct order
DROP TABLE IF EXISTS "LockLike" CASCADE;
DROP TABLE IF EXISTS "Post" CASCADE;
DROP TABLE IF EXISTS "Bitcoiner" CASCADE;

-- Create stored procedure for executing SQL statements
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql;

-- Create Bitcoiner table
CREATE TABLE IF NOT EXISTS "Bitcoiner" (
  "address" TEXT PRIMARY KEY,
  "handle" TEXT UNIQUE NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Post table
CREATE TABLE IF NOT EXISTS "Post" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "author_address" TEXT NOT NULL REFERENCES "Bitcoiner"("address"),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "is_locked" BOOLEAN DEFAULT FALSE,
  "media_url" TEXT,
  "media_type" TEXT,
  "description" TEXT,
  "confirmed" BOOLEAN DEFAULT FALSE
);

-- Create LockLike table
CREATE TABLE IF NOT EXISTS "LockLike" (
  "txid" TEXT PRIMARY KEY,
  "amount" BIGINT NOT NULL,
  "handle_id" TEXT NOT NULL,
  "locked_until" BIGINT NOT NULL,
  "post_id" TEXT NOT NULL REFERENCES "Post"("id"),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "confirmed" BOOLEAN DEFAULT FALSE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "post_author_idx" ON "Post"("author_address");
CREATE INDEX IF NOT EXISTS "post_created_at_idx" ON "Post"("created_at");
CREATE INDEX IF NOT EXISTS "post_confirmed_idx" ON "Post"("confirmed");
CREATE INDEX IF NOT EXISTS "locklike_post_id_idx" ON "LockLike"("post_id");
CREATE INDEX IF NOT EXISTS "locklike_handle_id_idx" ON "LockLike"("handle_id");
CREATE INDEX IF NOT EXISTS "locklike_confirmed_idx" ON "LockLike"("confirmed");
CREATE INDEX IF NOT EXISTS "bitcoiner_handle_idx" ON "Bitcoiner"("handle");

-- Enable Row Level Security
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LockLike" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bitcoiner" ENABLE ROW LEVEL SECURITY;

-- Create policies for Bitcoiner
CREATE POLICY "Allow read access to all bitcoiners"
  ON "Bitcoiner"
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert access to bitcoiners"
  ON "Bitcoiner"
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policies for Post
CREATE POLICY "Allow read access to all posts"
  ON "Post"
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert access to posts"
  ON "Post"
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policies for LockLike
CREATE POLICY "Allow read access to all locks"
  ON "LockLike"
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert access to locks"
  ON "LockLike"
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Recreate the user_stats view
CREATE OR REPLACE VIEW user_stats AS
SELECT 
  b."address",
  b."handle",
  COUNT(DISTINCT p."id") as post_count,
  COUNT(DISTINCT l."txid") as lock_count,
  COALESCE(SUM(l."amount"), 0) as total_locked_amount
FROM "Bitcoiner" b
LEFT JOIN "Post" p ON b."address" = p."author_address"
LEFT JOIN "LockLike" l ON p."id" = l."post_id"
GROUP BY b."address", b."handle"; 