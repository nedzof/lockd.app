#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
console.log('Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function dumpDatabase() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  console.log('Environment check:', {
    supabaseUrl,
    keyLength: supabaseKey.length,
    keyType: 'anon'
  });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test connection first
    console.log('\nTesting Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('Post')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('Connection test failed:', testError);
      process.exit(1);
    }
    console.log('Connection test successful');

    // Dump Bitcoiner table
    console.log('\n=== Bitcoiner Table ===');
    const { data: bitcoiners, error: bitcoinerError } = await supabase
      .from('Bitcoiner')
      .select('*')
      .order('created_at', { ascending: false });

    if (bitcoinerError) {
      console.error('Error fetching Bitcoiner records:', bitcoinerError);
    } else {
      console.log(`Found ${bitcoiners.length} Bitcoiner records:`);
      bitcoiners.forEach(b => {
        console.log(`\nBitcoiner:
  Address: ${b.address || 'EMPTY'}
  Handle: ${b.handle || 'EMPTY'}
  Created At: ${b.created_at}
  Valid: ${Boolean(b.address && b.handle)}`);
      });

      // Check for issues
      const invalidBitcoiners = bitcoiners.filter(b => !b.address || !b.handle);
      if (invalidBitcoiners.length > 0) {
        console.log('\n⚠️ Found invalid Bitcoiner records:', invalidBitcoiners.length);
      }
    }

    // Dump Post table with full details
    console.log('\n=== Post Table ===');
    const { data: posts, error: postError } = await supabase
      .from('Post')
      .select(`
        *,
        Bitcoiner (
          handle,
          address
        ),
        LockLike (
          txid,
          amount,
          handle_id,
          locked_until,
          created_at,
          confirmed
        )
      `)
      .order('created_at', { ascending: false });

    if (postError) {
      console.error('Error fetching Post records:', postError);
    } else {
      console.log(`Found ${posts.length} Post records:`);
      posts.forEach(p => {
        const totalLocked = p.LockLike?.reduce((sum, lock) => sum + (lock.amount || 0), 0) || 0;
        console.log(`\nPost:
  ID: ${p.id}
  Content: ${p.content || 'EMPTY'} (length: ${p.content?.length || 0})
  Author Address: ${p.author_address}
  Created At: ${p.created_at}
  Is Locked: ${p.is_locked}
  Media URL: ${p.media_url || 'N/A'}
  Media Type: ${p.media_type || 'N/A'}
  Description: ${p.description || 'N/A'}
  Confirmed: ${p.confirmed}
  Author: ${p.Bitcoiner ? p.Bitcoiner.handle : 'N/A'}
  Lock Count: ${p.LockLike ? p.LockLike.length : 0}
  Total Locked: ${totalLocked} (${totalLocked / 100000000} BSV)
  Valid: ${Boolean(p.id && p.author_address)}`);
      });

      // Check for issues
      const emptyContentPosts = posts.filter(p => !p.content);
      const noAuthorPosts = posts.filter(p => !p.author_address);
      if (emptyContentPosts.length > 0) {
        console.log('\n⚠️ Found posts with empty content:', emptyContentPosts.length);
      }
      if (noAuthorPosts.length > 0) {
        console.log('\n⚠️ Found posts without author:', noAuthorPosts.length);
      }
    }

    // Dump LockLike table with full details
    console.log('\n=== LockLike Table ===');
    const { data: locks, error: lockError } = await supabase
      .from('LockLike')
      .select(`
        *,
        Post (
          id,
          content,
          author_address,
          is_locked,
          confirmed
        )
      `)
      .order('created_at', { ascending: false });

    if (lockError) {
      console.error('Error fetching LockLike records:', lockError);
    } else {
      console.log(`Found ${locks.length} LockLike records:`);
      locks.forEach(l => {
        console.log(`\nLockLike:
  TXID: ${l.txid}
  Amount: ${l.amount} (${l.amount / 100000000} BSV)
  Handle ID: ${l.handle_id}
  Locked Until: ${new Date(l.locked_until * 1000).toISOString()}
  Created At: ${l.created_at}
  Post ID: ${l.post_id}
  Confirmed: ${l.confirmed}
  Post Content: ${l.Post?.content ? l.Post.content.substring(0, 50) + '...' : 'EMPTY'}
  Post Author: ${l.Post?.author_address || 'N/A'}
  Post Locked: ${l.Post?.is_locked}
  Post Confirmed: ${l.Post?.confirmed}
  Valid: ${Boolean(l.txid && l.amount > 0 && l.handle_id && l.post_id)}`);
      });

      // Check for issues
      const zeroAmountLocks = locks.filter(l => !l.amount || l.amount <= 0);
      const noPostLocks = locks.filter(l => !l.post_id);
      if (zeroAmountLocks.length > 0) {
        console.log('\n⚠️ Found locks with zero/invalid amount:', zeroAmountLocks.length);
      }
      if (noPostLocks.length > 0) {
        console.log('\n⚠️ Found locks without associated post:', noPostLocks.length);
      }
    }

  } catch (error) {
    console.error('Error dumping database:', error);
    process.exit(1);
  }
}

// Run the dump
dumpDatabase(); 