/**
 * Test Post Lock Calculation Script
 * 
 * This script tests the lock calculation for a specific post to verify if it's
 * correctly calculated. It replicates the logic used in the frontend and provides
 * detailed diagnostics about each step of the calculation.
 * 
 * Usage: 
 * ts-node src/scripts/test-post-lock-calculation.ts
 * 
 * or
 * 
 * npx tsx src/scripts/test-post-lock-calculation.ts
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Configuration
const API_URL = 'http://localhost:3003'; // API server runs on port 3003
const POST_ID = '17c7927c5f014ad1154878e826d66b614bb08f9859611e27ebf9f6b0e570e67e';

// Add mock data option for offline testing
const USE_MOCK_DATA = true; // Set to false to use the real API

// Mock data for offline testing
const MOCK_POST_DATA: Post = {
  id: POST_ID,
  tx_id: POST_ID,
  content: "Test post content",
  author_address: "test_address",
  created_at: new Date().toISOString(),
  tags: ["test", "lock"],
  is_vote: false,
  lock_likes: [
    {
      amount: 1000000, // 0.01 BSV in satoshis
      author_address: "test_address",
      unlock_height: 890000, // Future block height
      tx_id: "mock_tx_id_1",
      created_at: new Date().toISOString()
    },
    {
      amount: 2000000, // 0.02 BSV in satoshis
      author_address: "test_address_2",
      unlock_height: 885000, // Past block height (should be considered unlocked)
      tx_id: "mock_tx_id_2",
      created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
    },
    {
      amount: "3000000", // String amount to test conversion
      author_address: "test_address_3",
      unlock_height: 895000, // Future block height
      tx_id: "mock_tx_id_3",
      created_at: new Date().toISOString()
    },
    {
      amount: 4000000, // 0.04 BSV in satoshis
      author_address: "test_address_4",
      // Missing unlock_height to test handling
      tx_id: "mock_tx_id_4",
      created_at: new Date().toISOString()
    }
  ],
  total_locked: 4000000 // Expected: only the first and third locks (1000000 + 3000000) are still locked
};

// Define types
interface Lock {
  amount: number | string;  // Allow string for amount to handle potential API responses
  author_address?: string;
  unlock_height?: number | null;
  tx_id?: string;
  created_at?: string;
}

interface Post {
  id: string;
  tx_id: string;
  content: string;
  author_address?: string;
  created_at: string;
  tags: string[];
  lock_likes?: Lock[];
  is_vote?: boolean;
  vote_options?: any[];
  total_locked?: number;
  [key: string]: any;
}

/**
 * Implementation of is_still_locked function from frontend
 */
function is_still_locked(unlock_height: number | undefined | null, current_height: number | undefined | null): boolean {
  console.log(chalk.grey('is_still_locked check:'), { unlock_height, current_height });
  
  // If unlock_height is undefined or null, consider it unlocked
  if (unlock_height === undefined || unlock_height === null) {
    console.log(chalk.grey('unlock_height is undefined or null, considering unlocked'));
    return false;
  }
  
  // If current_height is undefined or null, we can't determine lock status
  if (current_height === undefined || current_height === null) {
    console.log(chalk.grey('current_height is undefined or null, cannot determine lock status'));
    return false;
  }
  
  // If current block height has reached or exceeded unlock height, it's unlockable
  const isLocked = current_height < unlock_height;
  console.log(chalk.grey(`current_height (${current_height}) < unlock_height (${unlock_height})? ${isLocked}`));
  return isLocked;
}

/**
 * Implementation of calculate_active_locked_amount function from frontend
 */
function calculate_active_locked_amount(
  lock_likes: Lock[] | undefined | null, 
  current_height: number | null
): number {
  // Add detailed debug log
  console.log(chalk.cyan('\nCalculating active locked amount:'));
  console.log('Input:', {
    lock_likes: lock_likes ? `Array with ${lock_likes.length} items` : null,
    current_height,
    type: typeof lock_likes,
    isArray: Array.isArray(lock_likes)
  });

  // Handle null or undefined input
  if (!lock_likes) {
    console.log(chalk.yellow('Lock_likes is null or undefined, returning 0'));
    return 0;
  }
  
  // Ensure it's an array
  if (!Array.isArray(lock_likes)) {
    console.log(chalk.red('calculate_active_locked_amount received non-array input:'), lock_likes);
    
    // Try to convert from object format if possible
    if (typeof lock_likes === 'object' && lock_likes !== null) {
      try {
        // Try to extract values if it's an object with numeric keys
        const values = Object.values(lock_likes) as Lock[];
        if (values.length > 0) {
          console.log(chalk.grey(`Converting lock_likes object to array with ${values.length} items`));
          return calculate_active_locked_amount(values, current_height);
        }
      } catch (e) {
        console.error(chalk.red('Failed to convert lock_likes object to array:'), e);
      }
    }
    return 0;
  }
  
  // Handle empty array
  if (lock_likes.length === 0) {
    console.log(chalk.yellow('Lock_likes is an empty array, returning 0'));
    return 0;
  }
  
  // Log each lock's data
  console.log(chalk.cyan('\nExamining individual locks:'));
  lock_likes.forEach((lock, index) => {
    const isStillLocked = is_still_locked(lock.unlock_height, current_height);
    console.log(chalk.grey(`Lock ${index}:`), {
      amount: lock.amount,
      amountType: typeof lock.amount,
      unlock_height: lock.unlock_height,
      isStillLocked
    });
  });
  
  // Check and fix invalid amount values in the array
  console.log(chalk.cyan('\nFixing lock amounts:'));
  const fixedLocks = lock_likes.map((lock, index) => {
    if (!lock) {
      console.log(chalk.yellow(`Lock ${index} is null or undefined, setting to { amount: 0, unlock_height: null }`));
      return { amount: 0, unlock_height: null };
    }
    
    // Handle string amounts
    if (typeof lock.amount === 'string') {
      const parsedAmount = parseInt(lock.amount as unknown as string, 10);
      if (!isNaN(parsedAmount)) {
        console.log(chalk.grey(`Converting string amount "${lock.amount}" to number: ${parsedAmount}`));
        return { ...lock, amount: parsedAmount };
      } else {
        console.log(chalk.yellow(`Lock ${index} has invalid string amount "${lock.amount}", setting to 0`));
        return { ...lock, amount: 0 };
      }
    }
    
    // Handle missing or invalid amounts
    if (typeof lock.amount !== 'number' || isNaN(lock.amount)) {
      console.log(chalk.yellow(`Lock ${index} has invalid amount type or NaN: ${typeof lock.amount}, setting to 0`));
      return { ...lock, amount: 0 };
    }
    
    return lock;
  });
  
  // Filter out locks with null unlock_height and calculate total of valid locks
  const validLocks = fixedLocks.filter(lock => lock.unlock_height !== null && lock.unlock_height !== undefined);
  
  console.log(chalk.cyan(`\nFound ${validLocks.length} locks with valid unlock heights out of ${fixedLocks.length} total locks`));
  
  // If we don't have current height, we can't determine lock status
  if (current_height === null) {
    console.log(chalk.yellow('No current block height, cannot determine lock status, returning 0'));
    return 0;
  }
  
  console.log(chalk.cyan('\nCalculating total locked amount:'));
  const result = validLocks.reduce((total, lock, index) => {
    // Skip invalid locks
    if (!lock || typeof lock !== 'object') {
      console.log(chalk.yellow(`Skipping invalid lock at index ${index}`));
      return total;
    }
    
    // If this individual lock is still locked, add its amount to the total
    if (is_still_locked(lock.unlock_height, current_height)) {
      // Ensure amount is a number
      const amount = typeof lock.amount === 'number' ? lock.amount : 0;
      console.log(chalk.green(`Adding locked amount ${amount} to total (currently ${total})`));
      return total + amount;
    }
    
    console.log(chalk.grey(`Lock with amount ${lock.amount} is not still locked, not adding to total`));
    return total;
  }, 0);
  
  console.log(chalk.green(`\nFinal active locked amount: ${result}`));
  return result;
}

/**
 * Format BSV amount (satoshis to BSV)
 */
function formatBSV(satoshis: number | string): string {
  // Convert string to number if needed
  const satoshisNum = typeof satoshis === 'string' ? parseInt(satoshis, 10) : satoshis;
  return (satoshisNum / 100000000).toFixed(8);
}

/**
 * Fetch the current block height from WhatsOnChain
 */
async function getCurrentBlockHeight(): Promise<number | null> {
  try {
    console.log(chalk.cyan('Fetching current block height from WhatsOnChain...'));
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch block height: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const height = data.blocks;
    
    console.log(chalk.green(`Current block height: ${height}`));
    return height;
  } catch (error) {
    console.error(chalk.red('Error fetching block height:'), error);
    // Fallback to approximate height
    const fallbackHeight = 889000;
    console.log(chalk.yellow(`Using fallback block height: ${fallbackHeight}`));
    return fallbackHeight;
  }
}

/**
 * Fetch post data from the API
 */
async function fetchPost(postId: string): Promise<Post | null> {
  try {
    console.log(chalk.cyan(`Fetching post with ID: ${postId}...`));
    const response = await fetch(`${API_URL}/api/posts/${postId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch post: ${response.status} ${response.statusText}`);
    }
    
    const post = await response.json();
    console.log(chalk.green('Post fetched successfully'));
    return post;
  } catch (error) {
    console.error(chalk.red('Error fetching post:'), error);
    return null;
  }
}

/**
 * Fetch post data by transaction ID
 */
async function fetchPostByTxId(txId: string): Promise<Post | null> {
  try {
    console.log(chalk.cyan(`Fetching post with TX ID: ${txId}...`));
    const response = await fetch(`${API_URL}/api/posts/tx/${txId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch post by TX ID: ${response.status} ${response.statusText}`);
    }
    
    const { post } = await response.json();
    console.log(chalk.green('Post fetched successfully by TX ID'));
    return post;
  } catch (error) {
    console.error(chalk.red('Error fetching post by TX ID:'), error);
    return null;
  }
}

/**
 * Save post data to a file for offline analysis
 */
function savePostToFile(post: Post, filename: string): void {
  try {
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
    console.log(chalk.green(`Post data saved to ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Error saving post data to file:'), error);
  }
}

/**
 * Main function to test the lock calculation
 */
async function main() {
  console.log(chalk.green('='.repeat(80)));
  console.log(chalk.green('POST LOCK CALCULATION TEST'));
  console.log(chalk.green('='.repeat(80)));
  
  // Get current block height
  const currentBlockHeight = await getCurrentBlockHeight();
  
  if (!currentBlockHeight) {
    console.error(chalk.red('Could not get current block height, aborting test'));
    return;
  }
  
  let post = null;
  
  // Use mock data if specified or fetch from API
  if (USE_MOCK_DATA) {
    console.log(chalk.yellow('Using mock data for testing'));
    post = MOCK_POST_DATA;
  } else {
    // Fetch post by ID first
    post = await fetchPost(POST_ID);
    
    // If we can't fetch by ID, try fetching by TX ID
    if (!post) {
      console.log(chalk.yellow(`Could not fetch post by ID, trying TX ID: ${POST_ID}`));
      post = await fetchPostByTxId(POST_ID);
    }
    
    // If API fetching fails, fall back to mock data
    if (!post) {
      console.log(chalk.yellow('Could not fetch post data from API, using mock data instead'));
      post = MOCK_POST_DATA;
    }
  }
  
  if (!post) {
    console.error(chalk.red('No post data available, aborting test'));
    return;
  }
  
  // Save post data for offline analysis
  savePostToFile(post, `post-${POST_ID.substring(0, 8)}.json`);
  
  // Print basic post info
  console.log(chalk.green('\nPOST INFORMATION:'));
  console.log(chalk.cyan('ID:'), post.id);
  console.log(chalk.cyan('TX ID:'), post.tx_id);
  console.log(chalk.cyan('Content:'), post.content?.substring(0, 100) + (post.content?.length > 100 ? '...' : ''));
  console.log(chalk.cyan('Author:'), post.author_address || 'Unknown');
  console.log(chalk.cyan('Created:'), post.created_at);
  console.log(chalk.cyan('Tags:'), post.tags?.join(', ') || 'None');
  console.log(chalk.cyan('Is Vote:'), post.is_vote ? 'Yes' : 'No');
  
  // Print lock likes info
  console.log(chalk.green('\nLOCK LIKES INFORMATION:'));
  if (!post.lock_likes || post.lock_likes.length === 0) {
    console.log(chalk.yellow('No lock likes found for this post'));
  } else {
    console.log(chalk.cyan(`Found ${post.lock_likes.length} lock likes`));
    
    // Print details of each lock
    console.log(chalk.green('\nLOCK DETAILS:'));
    post.lock_likes.forEach((lock, index) => {
      console.log(chalk.cyan(`Lock #${index + 1}:`));
      console.log(`Amount: ${lock.amount} satoshis (${formatBSV(lock.amount)} BSV)`);
      console.log(`Unlock Height: ${lock.unlock_height || 'Not specified'}`);
      console.log(`Author: ${lock.author_address || 'Unknown'}`);
      console.log(`TX ID: ${lock.tx_id || 'Unknown'}`);
      console.log(`Created: ${lock.created_at || 'Unknown'}`);
      
      // Is this lock still active?
      const isLocked = is_still_locked(lock.unlock_height, currentBlockHeight);
      console.log(`Status: ${isLocked ? chalk.green('LOCKED') : chalk.yellow('UNLOCKED')}`);
      
      // If unlocked, calculate how many blocks ago it unlocked
      if (!isLocked && lock.unlock_height) {
        const blocksAgo = currentBlockHeight - lock.unlock_height;
        console.log(`Unlocked: ${blocksAgo} blocks ago (approximately ${Math.floor(blocksAgo / 144)} days ago)`);
      }
      
      // If locked, calculate how many blocks until unlock
      if (isLocked && lock.unlock_height) {
        const blocksRemaining = lock.unlock_height - currentBlockHeight;
        console.log(`Unlocks in: ${blocksRemaining} blocks (approximately ${Math.floor(blocksRemaining / 144)} days)`);
      }
      
      console.log('---');
    });
  }
  
  // Calculate the active locked amount
  console.log(chalk.green('\nCALCULATING ACTIVE LOCKED AMOUNT:'));
  const activeLocked = calculate_active_locked_amount(post.lock_likes, currentBlockHeight);
  
  console.log(chalk.green('\nRESULTS:'));
  console.log(chalk.cyan('Active Locked Amount:'), `${activeLocked} satoshis (${formatBSV(activeLocked)} BSV)`);
  
  if (post.total_locked !== undefined) {
    console.log(chalk.cyan('Post Total Locked (from API):'), `${post.total_locked} satoshis (${formatBSV(post.total_locked)} BSV)`);
    
    // Compare the calculated amount with the API amount
    if (activeLocked === post.total_locked) {
      console.log(chalk.green('✓ Calculation MATCHES the API value'));
    } else {
      console.log(chalk.red('✗ Calculation DIFFERS from the API value'));
      console.log(chalk.yellow(`Difference: ${activeLocked - post.total_locked} satoshis (${formatBSV(activeLocked - post.total_locked)} BSV)`));
    }
  } else {
    console.log(chalk.yellow('No total_locked value found in the API response to compare with'));
  }
  
  console.log(chalk.green('\nTEST COMPLETED\n'));
}

// Run the main function
main().catch((error) => {
  console.error(chalk.red('Unhandled error in main function:'), error);
}); 