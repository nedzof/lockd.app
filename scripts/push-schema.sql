-- Create Post table
CREATE TABLE IF NOT EXISTS "Post" (
  "txid" text PRIMARY KEY,
  "content" text NOT NULL,
  "author_address" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "media_url" text,
  "media_type" text,
  "description" text,
  CONSTRAINT "fk_author" FOREIGN KEY ("author_address") REFERENCES "Bitcoiner"("handle")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_post_created_at" ON "Post" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_post_author" ON "Post" ("author_address");

-- Enable Row Level Security
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON "Post"
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON "Post"
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for post owners" ON "Post"
  FOR UPDATE USING (auth.uid()::text = author_address);

CREATE POLICY "Enable delete for post owners" ON "Post"
  FOR DELETE USING (auth.uid()::text = author_address); 