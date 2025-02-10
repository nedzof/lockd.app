-- Enum Types
CREATE TYPE post_type AS ENUM ('post');

-- Bitcoiner Table
CREATE TABLE IF NOT EXISTS "Bitcoiner" (
    address TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post Table
CREATE TABLE IF NOT EXISTS "Post" (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    author_address TEXT NOT NULL REFERENCES "Bitcoiner"(address) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_locked BOOLEAN DEFAULT false,
    confirmed BOOLEAN DEFAULT false,
    type post_type NOT NULL,
    media_data JSONB DEFAULT NULL,
    source_data JSONB DEFAULT NULL,
    prediction_market_data JSONB DEFAULT NULL,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

-- Example media_data structure:
-- {
--   "url": "https://example.com/image.jpg",
--   "type": "image/jpeg",
--   "description": "Image description"
-- }

-- Example source_data structure:
-- {
--   "url": "https://example.com/source"
-- }

-- Example prediction_market_data structure:
-- {
--   "url": "https://example.com/market",
--   "title": "Market Title",
--   "end_date": "2024-12-31T23:59:59Z",
--   "probability": 0.85
-- }

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT NOT NULL,
    bitcoiner_address TEXT NOT NULL REFERENCES "Bitcoiner"(address) ON DELETE CASCADE,
    filter_time BOOLEAN DEFAULT true,
    filter_top BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    notification_settings JSONB DEFAULT jsonb_build_object(
        'email_notifications', true,
        'push_notifications', true,
        'notification_frequency', 'immediate',
        'notify_on_mentions', true,
        'notify_on_replies', true,
        'notify_on_likes', true,
        'notify_on_reposts', true,
        'notify_on_follows', true,
        'quiet_hours_start', '22:00',
        'quiet_hours_end', '08:00',
        'quiet_hours_enabled', false
    ),
    content_preferences JSONB DEFAULT jsonb_build_object(
        'preferred_tags', ARRAY[]::text[],
        'excluded_tags', ARRAY[]::text[],
        'preferred_content_types', ARRAY['text', 'image', 'video', 'link']::text[],
        'language_preferences', ARRAY['en']::text[],
        'adult_content_enabled', false,
        'auto_play_videos', true,
        'default_feed_sort', 'recent',
        'default_feed_filter', 'all'
    ),
    feed_customization JSONB DEFAULT jsonb_build_object(
        'pinned_tags', ARRAY[]::text[],
        'muted_users', ARRAY[]::text[],
        'followed_users', ARRAY[]::text[],
        'saved_posts', ARRAY[]::text[],
        'display_density', 'comfortable',
        'theme_preference', 'system',
        'show_read_posts', true,
        'show_post_previews', true
    ),
    PRIMARY KEY (user_id)
);

-- LockLike Table
CREATE TABLE IF NOT EXISTS "LockLike" (
    txid TEXT PRIMARY KEY,
    amount BIGINT NOT NULL,
    locked_until TIMESTAMPTZ NOT NULL,
    post_id TEXT NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed BOOLEAN DEFAULT false
);

-- Views
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    b.address,
    COUNT(DISTINCT p.id) as post_count,
    COUNT(DISTINCT l.txid) as like_count,
    b.created_at as joined_at
FROM "Bitcoiner" b
LEFT JOIN "Post" p ON b.address = p.author_address
LEFT JOIN "LockLike" l ON l.post_id = p.id
GROUP BY b.address, b.created_at;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_author_address ON "Post"(author_address);
CREATE INDEX IF NOT EXISTS idx_post_created_at ON "Post"(created_at);
CREATE INDEX IF NOT EXISTS idx_post_tags ON "Post" USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_post_media_data ON "Post" USING gin (media_data);
CREATE INDEX IF NOT EXISTS idx_post_source_data ON "Post" USING gin (source_data);
CREATE INDEX IF NOT EXISTS idx_post_prediction_market ON "Post" USING gin (prediction_market_data);

CREATE INDEX IF NOT EXISTS idx_locklike_post_id ON "LockLike"(post_id);
CREATE INDEX IF NOT EXISTS idx_locklike_created_at ON "LockLike"(created_at);

CREATE INDEX IF NOT EXISTS idx_user_preferences_bitcoiner_address ON user_preferences(bitcoiner_address);
CREATE INDEX IF NOT EXISTS idx_user_preferences_notification_settings ON user_preferences USING gin (notification_settings);
CREATE INDEX IF NOT EXISTS idx_user_preferences_content_preferences ON user_preferences USING gin (content_preferences);
CREATE INDEX IF NOT EXISTS idx_user_preferences_feed_customization ON user_preferences USING gin (feed_customization);

-- Available Tags (for reference)
COMMENT ON TABLE "Post" IS 'Available tags: Politics, Crypto, Sports, Pop Culture, Economics/Business, Science/Technology, Current Events, Finance, Health, Miscellaneous/Oddities'; 