-- Create block_heights table if it doesn't exist
CREATE TABLE IF NOT EXISTS "block_heights" (
    height bigint NOT NULL,
    timestamp timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT NOW()
);

-- Insert initial block height
INSERT INTO "block_heights" (height, timestamp)
VALUES (793000, NOW());

-- Insert 20 different creators
INSERT INTO "Bitcoiner" (handle, created_at, pubkey)
VALUES
  ('satoshi_vision', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('bsv_enthusiast', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('blockchain_builder', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('crypto_artist', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('digital_creator', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('nft_master', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('web3_developer', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('defi_expert', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('meme_lord', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('content_creator', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('tech_innovator', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('bitcoin_maximalist', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('blockchain_guru', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('crypto_trader', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('nft_collector', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('web3_enthusiast', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('defi_trader', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('meme_artist', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('content_strategist', NOW(), '02' || encode(gen_random_bytes(32), 'hex')),
  ('tech_visionary', NOW(), '02' || encode(gen_random_bytes(32), 'hex'));

-- Function to generate random timestamps within the last 30 days
CREATE OR REPLACE FUNCTION random_recent_timestamp()
RETURNS timestamp AS $$
BEGIN
  RETURN NOW() - (random() * interval '30 days');
END;
$$ LANGUAGE plpgsql;

-- Function to generate random BSV amounts between 0.1 and 50 BSV (in satoshis)
CREATE OR REPLACE FUNCTION random_bsv_amount()
RETURNS bigint AS $$
BEGIN
  RETURN (random() * 4990000000 + 10000000)::bigint; -- 0.1 to 50 BSV in satoshis
END;
$$ LANGUAGE plpgsql;

-- Function to calculate future block height (approximately 1 block every 10 minutes)
CREATE OR REPLACE FUNCTION calculate_future_block_height(days integer)
RETURNS bigint AS $$
BEGIN
  -- Current height + (blocks per day * days)
  -- 144 blocks per day (6 blocks per hour * 24 hours)
  RETURN (SELECT height FROM block_heights ORDER BY timestamp DESC LIMIT 1) + (144 * days);
END;
$$ LANGUAGE plpgsql;

-- Insert 1000 posts with random creators and timestamps
INSERT INTO "posts" (txid, handle_id, content, media_url, amount, created_at, lock_until_height)
SELECT 
  'tx_' || gen_random_uuid() as txid,
  (SELECT handle FROM "Bitcoiner" ORDER BY random() LIMIT 1) as handle_id,
  CASE (random() * 4)::int
    WHEN 0 THEN 'Just created an amazing new BSV project! 🚀 #BSV #Bitcoin'
    WHEN 1 THEN 'Building the future of digital content on BSV 💪 #Blockchain'
    WHEN 2 THEN 'Check out my latest creation on the BSV blockchain! ✨'
    WHEN 3 THEN 'Innovation never stops in the BSV ecosystem 🌟'
    ELSE 'Another milestone reached in BSV development 🎯'
  END as content,
  CASE (random() * 4)::int
    WHEN 0 THEN 'https://example.com/media1.mp4'
    WHEN 1 THEN 'https://example.com/media2.mp4'
    WHEN 2 THEN 'https://example.com/media3.mp4'
    WHEN 3 THEN 'https://example.com/media4.mp4'
    ELSE 'https://example.com/media5.mp4'
  END as media_url,
  random_bsv_amount() as amount,
  random_recent_timestamp() as created_at,
  calculate_future_block_height(30) as lock_until_height -- Lock for 30 days
FROM generate_series(1, 1000);

-- Insert random lock-likes for the posts
INSERT INTO "locklikes" (txid, post_txid, amount, lock_until_height, created_at)
SELECT 
  'tx_' || gen_random_uuid() as txid,
  p.txid as post_txid,
  random_bsv_amount() as amount,
  calculate_future_block_height(30) as lock_until_height, -- Lock for 30 days
  random_recent_timestamp() as created_at
FROM "posts" p
CROSS JOIN "Bitcoiner" b
WHERE random() < 0.3 -- 30% chance of creating a lock-like for each post-creator combination
AND p.created_at >= NOW() - interval '30 days'
LIMIT 2000; -- This will create approximately 2 lock-likes per post on average

-- Drop the temporary functions
DROP FUNCTION random_recent_timestamp();
DROP FUNCTION random_bsv_amount();
DROP FUNCTION calculate_future_block_height(integer); 