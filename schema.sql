-- Enable RLS
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create tables
CREATE TABLE IF NOT EXISTS "public"."Bitcoiner" (
    "handle" TEXT PRIMARY KEY,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "pubkey" TEXT NOT NULL,
    "avatar" TEXT
);

CREATE TABLE IF NOT EXISTS "public"."Post" (
    "txid" TEXT PRIMARY KEY,
    "amount" BIGINT NOT NULL,
    "handle_id" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "locked_until" BIGINT DEFAULT 0,
    "media_url" TEXT,
    CONSTRAINT "Post_handle_id_fkey" FOREIGN KEY ("handle_id") REFERENCES "public"."Bitcoiner"("handle") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."LockLike" (
    "txid" TEXT PRIMARY KEY,
    "amount" BIGINT NOT NULL,
    "handle_id" TEXT NOT NULL,
    "locked_until" BIGINT DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "post_id" TEXT NOT NULL,
    CONSTRAINT "LockLike_handle_id_fkey" FOREIGN KEY ("handle_id") REFERENCES "public"."Bitcoiner"("handle") ON DELETE CASCADE,
    CONSTRAINT "LockLike_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."Post"("txid") ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "post_handle_id_idx" ON "public"."Post"("handle_id");
CREATE INDEX IF NOT EXISTS "locklike_handle_id_idx" ON "public"."LockLike"("handle_id");
CREATE INDEX IF NOT EXISTS "locklike_post_id_idx" ON "public"."LockLike"("post_id");
CREATE INDEX IF NOT EXISTS "post_created_at_idx" ON "public"."Post"("created_at");
CREATE INDEX IF NOT EXISTS "locklike_created_at_idx" ON "public"."LockLike"("created_at");

-- Enable Row Level Security
ALTER TABLE "public"."Bitcoiner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LockLike" ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON "public"."Bitcoiner"
    FOR SELECT
    USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."Post"
    FOR SELECT
    USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."LockLike"
    FOR SELECT
    USING (true);

-- Insert default anon user if it doesn't exist
INSERT INTO "public"."Bitcoiner" ("handle", "pubkey")
VALUES ('anon', '02eb0b9d11e2d4989ba95e6c787fc25b3e7ce14b79dc5902036000429671ef5362')
ON CONFLICT ("handle") DO NOTHING; 