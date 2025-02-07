-- Insert some Bitcoiners
INSERT INTO "public"."Bitcoiner" ("handle", "pubkey", "avatar") VALUES
('satoshi', '02eb0b9d11e2d4989ba95e6c787fc25b3e7ce14b79dc5902036000429671ef5361', 'https://pbs.twimg.com/profile_images/1234567890/satoshi.jpg'),
('vitalik', '02eb0b9d11e2d4989ba95e6c787fc25b3e7ce14b79dc5902036000429671ef5363', 'https://pbs.twimg.com/profile_images/1234567890/vitalik.jpg'),
('adam_back', '02eb0b9d11e2d4989ba95e6c787fc25b3e7ce14b79dc5902036000429671ef5364', 'https://pbs.twimg.com/profile_images/1234567890/adam.jpg')
ON CONFLICT ("handle") DO NOTHING;

-- Insert some Posts with varying lock periods
INSERT INTO "public"."Post" ("txid", "amount", "handle_id", "content", "locked_until", "created_at") VALUES
('tx_1', 5000000, 'satoshi', 'Just set up some mining nodes. This is fascinating! 🚀 #Bitcoin', 850000, NOW() - INTERVAL '2 days'),
('tx_2', 3000000, 'vitalik', 'Thoughts on scalability and the future of blockchain. What do you think? 🤔', 849000, NOW() - INTERVAL '1 day'),
('tx_3', 2000000, 'adam_back', 'Hashcash walked so Bitcoin could run. Remember your history! 📚', 848000, NOW() - INTERVAL '12 hours'),
('tx_4', 8000000, 'satoshi', 'The root problem with conventional currency is all the trust that''s required to make it work. 💭', 847000, NOW() - INTERVAL '6 hours'),
('tx_5', 4000000, 'vitalik', 'Layer 2 solutions are the key to mass adoption. Change my mind! 🔄', 846000, NOW() - INTERVAL '3 hours')
ON CONFLICT ("txid") DO NOTHING;

-- Insert LockLikes with varying amounts
INSERT INTO "public"."LockLike" ("txid", "amount", "handle_id", "post_id", "locked_until", "created_at") VALUES
('lock_1', 1000000, 'vitalik', 'tx_1', 850000, NOW() - INTERVAL '1 day'),
('lock_2', 2000000, 'adam_back', 'tx_1', 849500, NOW() - INTERVAL '23 hours'),
('lock_3', 1500000, 'satoshi', 'tx_2', 849000, NOW() - INTERVAL '12 hours'),
('lock_4', 3000000, 'adam_back', 'tx_2', 848500, NOW() - INTERVAL '11 hours'),
('lock_5', 2500000, 'vitalik', 'tx_3', 848000, NOW() - INTERVAL '10 hours'),
('lock_6', 1800000, 'satoshi', 'tx_3', 847500, NOW() - INTERVAL '9 hours'),
('lock_7', 2200000, 'adam_back', 'tx_4', 847000, NOW() - INTERVAL '8 hours'),
('lock_8', 1700000, 'vitalik', 'tx_4', 846500, NOW() - INTERVAL '7 hours'),
('lock_9', 2800000, 'satoshi', 'tx_5', 846000, NOW() - INTERVAL '6 hours'),
('lock_10', 1900000, 'adam_back', 'tx_5', 845500, NOW() - INTERVAL '5 hours')
ON CONFLICT ("txid") DO NOTHING; 