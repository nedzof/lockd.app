-- Create stored procedure for executing SQL statements
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql;

-- Create Post table
CREATE TABLE IF NOT EXISTS "Post" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "author_address" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "is_locked" BOOLEAN DEFAULT FALSE,
  "media_url" TEXT,
  "media_type" TEXT,
  "description" TEXT
);

-- Create LockLike table
CREATE TABLE IF NOT EXISTS "LockLike" (
  "txid" TEXT PRIMARY KEY,
  "amount" BIGINT NOT NULL,
  "handle_id" TEXT NOT NULL,
  "locked_until" BIGINT NOT NULL,
  "post_id" TEXT NOT NULL REFERENCES "Post"("id"),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "post_author_idx" ON "Post"("author_address");
CREATE INDEX IF NOT EXISTS "post_created_at_idx" ON "Post"("created_at");
CREATE INDEX IF NOT EXISTS "locklike_post_id_idx" ON "LockLike"("post_id");
CREATE INDEX IF NOT EXISTS "locklike_handle_id_idx" ON "LockLike"("handle_id");

-- Enable Row Level Security
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LockLike" ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to all posts"
  ON "Post"
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow read access to all locks"
  ON "LockLike"
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert access to posts"
  ON "Post"
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow insert access to locks"
  ON "LockLike"
  FOR INSERT
  TO public
  WITH CHECK (true); 