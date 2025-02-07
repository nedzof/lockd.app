#!/bin/bash

SUPABASE_URL="https://armwtaxnwajmunysmbjr.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjI1MDQsImV4cCI6MjA1NDQ5ODUwNH0.RN5aElUBDafoPqdHI6xTL4EycZ72wxuOyFzWHJ0Un2g"

# Create tables
echo "Creating Bitcoiner table..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"CREATE TABLE IF NOT EXISTS \\\"public\\\".\\\"Bitcoiner\\\" (\\\"handle\\\" TEXT PRIMARY KEY, \\\"created_at\\\" TIMESTAMPTZ DEFAULT NOW(), \\\"pubkey\\\" TEXT NOT NULL, \\\"avatar\\\" TEXT);\"}"

echo "Creating Post table..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"CREATE TABLE IF NOT EXISTS \\\"public\\\".\\\"Post\\\" (\\\"txid\\\" TEXT PRIMARY KEY, \\\"amount\\\" BIGINT NOT NULL, \\\"handle_id\\\" TEXT NOT NULL, \\\"content\\\" TEXT DEFAULT '', \\\"created_at\\\" TIMESTAMPTZ DEFAULT NOW(), \\\"locked_until\\\" BIGINT DEFAULT 0, \\\"media_url\\\" TEXT, CONSTRAINT \\\"Post_handle_id_fkey\\\" FOREIGN KEY (\\\"handle_id\\\") REFERENCES \\\"public\\\".\\\"Bitcoiner\\\"(\\\"handle\\\") ON DELETE CASCADE);\"}"

echo "Creating LockLike table..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"CREATE TABLE IF NOT EXISTS \\\"public\\\".\\\"LockLike\\\" (\\\"txid\\\" TEXT PRIMARY KEY, \\\"amount\\\" BIGINT NOT NULL, \\\"handle_id\\\" TEXT NOT NULL, \\\"locked_until\\\" BIGINT DEFAULT 0, \\\"created_at\\\" TIMESTAMPTZ DEFAULT NOW(), \\\"post_id\\\" TEXT NOT NULL, CONSTRAINT \\\"LockLike_handle_id_fkey\\\" FOREIGN KEY (\\\"handle_id\\\") REFERENCES \\\"public\\\".\\\"Bitcoiner\\\"(\\\"handle\\\") ON DELETE CASCADE, CONSTRAINT \\\"LockLike_post_id_fkey\\\" FOREIGN KEY (\\\"post_id\\\") REFERENCES \\\"public\\\".\\\"Post\\\"(\\\"txid\\\") ON DELETE CASCADE);\"}"

# Create indexes
echo "Creating indexes..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"CREATE INDEX IF NOT EXISTS \\\"post_handle_id_idx\\\" ON \\\"public\\\".\\\"Post\\\"(\\\"handle_id\\\"); CREATE INDEX IF NOT EXISTS \\\"locklike_handle_id_idx\\\" ON \\\"public\\\".\\\"LockLike\\\"(\\\"handle_id\\\"); CREATE INDEX IF NOT EXISTS \\\"locklike_post_id_idx\\\" ON \\\"public\\\".\\\"LockLike\\\"(\\\"post_id\\\"); CREATE INDEX IF NOT EXISTS \\\"post_created_at_idx\\\" ON \\\"public\\\".\\\"Post\\\"(\\\"created_at\\\"); CREATE INDEX IF NOT EXISTS \\\"locklike_created_at_idx\\\" ON \\\"public\\\".\\\"LockLike\\\"(\\\"created_at\\\");\"}"

# Enable RLS
echo "Enabling Row Level Security..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"ALTER TABLE \\\"public\\\".\\\"Bitcoiner\\\" ENABLE ROW LEVEL SECURITY; ALTER TABLE \\\"public\\\".\\\"Post\\\" ENABLE ROW LEVEL SECURITY; ALTER TABLE \\\"public\\\".\\\"LockLike\\\" ENABLE ROW LEVEL SECURITY;\"}"

# Create policies
echo "Creating policies..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"CREATE POLICY \\\"Enable read access for all users\\\" ON \\\"public\\\".\\\"Bitcoiner\\\" FOR SELECT USING (true); CREATE POLICY \\\"Enable read access for all users\\\" ON \\\"public\\\".\\\"Post\\\" FOR SELECT USING (true); CREATE POLICY \\\"Enable read access for all users\\\" ON \\\"public\\\".\\\"LockLike\\\" FOR SELECT USING (true);\"}"

# Insert default anon user
echo "Inserting default anon user..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/execute_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"query\": \"INSERT INTO \\\"public\\\".\\\"Bitcoiner\\\" (\\\"handle\\\", \\\"pubkey\\\") VALUES ('anon', '02eb0b9d11e2d4989ba95e6c787fc25b3e7ce14b79dc5902036000429671ef5362') ON CONFLICT (\\\"handle\\\") DO NOTHING;\"}"

echo "Schema push completed!" 