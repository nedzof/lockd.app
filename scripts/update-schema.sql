-- Add author_address column to Post table if it doesn't exist
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS author_address text;

-- Add foreign key constraint
ALTER TABLE "Post" 
ADD CONSTRAINT "Post_author_address_fkey" 
FOREIGN KEY (author_address) 
REFERENCES "Bitcoiner" (address);

-- Create UserPreferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS "UserPreferences" (
    address text PRIMARY KEY REFERENCES "Bitcoiner" (address) ON DELETE CASCADE,
    notification_settings jsonb DEFAULT '{}',
    content_preferences jsonb DEFAULT '{}',
    feed_customization jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

-- Update LockLike table to use address instead of handle_id
ALTER TABLE "LockLike" DROP CONSTRAINT IF EXISTS "LockLike_handle_id_fkey";
ALTER TABLE "LockLike" RENAME COLUMN handle_id TO address;
ALTER TABLE "LockLike" 
ADD CONSTRAINT "LockLike_address_fkey" 
FOREIGN KEY (address) 
REFERENCES "Bitcoiner" (address);

-- Add blockHeight column to Post table if it doesn't exist
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "blockHeight" bigint;

-- Add tags column to Post table if it doesn't exist
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS tags text[]; 