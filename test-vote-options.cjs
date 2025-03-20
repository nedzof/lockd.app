// Simple script to test vote option percentage calculations
const fetch = require('node-fetch');
const fs = require('fs');

// The specific post ID to test
const POST_ID = '17c7927c5f014ad1154878e826d66b614bb08f9859611e27ebf9f6b0e570e67e';
// const API_URL = 'https://beta.lockd.app';
const API_URL = 'http://localhost:3003';
const USE_MOCK_DATA = true; // Set to true to use mock data instead of API

// Mock data based on the post in screenshot
const MOCK_POST_DATA = {
  id: POST_ID,
  tx_id: POST_ID,
  content: "hast du bock zensiert zu werden?",
  author_address: "test_address",
  created_at: "2025-03-20T21:25:11.095Z",
  tags: ["zensur"],
  is_vote: true,
  vote_options: [
    {
      id: "option1",
      tx_id: "option1",
      content: "Ich habe keine wahl!",
      author_address: "test_address",
      created_at: "2025-03-20T21:25:11.095Z",
      lock_amount: 0,
      lock_duration: 144,
      tags: [],
      lock_likes: [
        {
          amount: "1000000", // 0.01 BSV as string
          author_address: "user1",
          unlock_height: 890000 // Locked (future)
        }
      ]
    },
    {
      id: "option2",
      tx_id: "option2", 
      content: "ja klar",
      author_address: "test_address",
      created_at: "2025-03-20T21:25:11.095Z",
      lock_amount: 0,
      lock_duration: 144,
      tags: [],
      lock_likes: [
        {
          amount: "2000000", // 0.02 BSV as string
          author_address: "user2",
          unlock_height: 885000 // Unlocked (past)
        }
      ]
    },
    {
      id: "option3",
      tx_id: "option3",
      content: "nein hau ab!",
      author_address: "test_address",
      created_at: "2025-03-20T21:25:11.095Z",
      lock_amount: 0,
      lock_duration: 144,
      tags: [],
      lock_likes: [
        {
          amount: "3000000", // 0.03 BSV as string
          author_address: "user3",
          unlock_height: 895000 // Locked (future)
        }
      ]
    }
  ],
  totalLocked: 4000000 // 0.04 BSV - this is what the API would return
};

// Helper function to format BSV
function formatBSV(amount) {
  // Handle string inputs by converting to number
  if (typeof amount === 'string') {
    amount = parseInt(amount, 10);
  }
  return (amount / 100000000).toFixed(8);
}

// Helper function to calculate percentage
function calculatePercentage(amount, total) {
  if (!total) return 0;
  return Math.round((amount / total) * 100);
}

// Function to check if a lock is still active
function isStillLocked(unlockHeight, currentHeight) {
  if (unlockHeight === undefined || unlockHeight === null) {
    return false;
  }
  
  if (currentHeight === undefined || currentHeight === null) {
    return false;
  }
  
  return currentHeight < unlockHeight;
}

// Function to calculate active locked amount
function calculateActiveLocked(lockLikes, currentHeight) {
  console.log('Calculating active locked amount with:');
  console.log('- lockLikes:', lockLikes ? lockLikes.length : 0, 'items');
  console.log('- currentHeight:', currentHeight);
  
  if (!lockLikes || !Array.isArray(lockLikes) || lockLikes.length === 0) {
    return 0;
  }
  
  let total = 0;
  
  for (const lock of lockLikes) {
    if (!lock) continue;
    
    let amount = 0;
    if (typeof lock.amount === 'string') {
      amount = parseInt(lock.amount, 10) || 0;
    } else if (typeof lock.amount === 'number') {
      amount = lock.amount;
    }
    
    const isLocked = isStillLocked(lock.unlock_height, currentHeight);
    console.log(`Lock amount: ${amount}, unlock_height: ${lock.unlock_height}, isLocked: ${isLocked}`);
    
    if (isLocked) {
      total += amount;
    }
  }
  
  console.log(`Total active locked: ${total}`);
  return total;
}

// Main function
async function main() {
  console.log('Starting vote option analysis for post:', POST_ID);
  
  try {
    // Fetch current block height
    const blockResponse = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const blockData = await blockResponse.json();
    const currentBlockHeight = blockData.blocks || 888000;
    console.log('Current block height:', currentBlockHeight);
    
    // Initialize post variable
    let post = null;
    
    // Use mock data if specified or try to fetch from API
    if (USE_MOCK_DATA) {
      console.log('Using mock data for testing');
      post = MOCK_POST_DATA;
    } else {
      // Fetch post by ID
      console.log('Fetching post from API...');
      const response = await fetch(`${API_URL}/api/posts/${POST_ID}`);
      
      if (!response.ok) {
        console.log(`Failed to fetch post by ID: ${response.status} ${response.statusText}`);
        console.log('Falling back to mock data');
        post = MOCK_POST_DATA;
      } else {
        post = await response.json();
        console.log('Post data retrieved successfully from API');
      }
    }
    
    // Save post data for inspection
    fs.writeFileSync(`post-${POST_ID.substring(0, 8)}.json`, JSON.stringify(post, null, 2));
    console.log(`Post data saved to post-${POST_ID.substring(0, 8)}.json for inspection`);
    
    // Check if this is a vote post
    if (!post.is_vote) {
      console.log('This is not a vote post. Exiting.');
      return;
    }
    
    if (!post.vote_options || !Array.isArray(post.vote_options) || post.vote_options.length === 0) {
      console.log('No vote options found for this post. Exiting.');
      return;
    }
    
    console.log(`\n=== Vote Options Analysis ===`);
    console.log('Vote options found:', post.vote_options.length);
    
    // Calculate total locked amount across all vote options - ONLY COUNTING ACTIVE LOCKS
    const totalLockedAmount = post.vote_options.reduce((sum, option) => {
      const activeLocked = calculateActiveLocked(option.lock_likes, currentBlockHeight);
      return sum + activeLocked;
    }, 0);
    
    console.log('Total ACTIVE locked amount across all vote options:', formatBSV(totalLockedAmount), 'BSV');
    
    // Analyze each vote option
    post.vote_options.forEach((option, index) => {
      console.log(`\n[Option ${index + 1}]: ${option.content}`);
      
      if (!option.lock_likes || !Array.isArray(option.lock_likes) || option.lock_likes.length === 0) {
        console.log('No lock_likes found for this option');
      } else {
        console.log(`Found ${option.lock_likes.length} lock_likes for this option`);
        
        // Calculate active locked amount for this option
        const activeLocked = calculateActiveLocked(option.lock_likes, currentBlockHeight);
        console.log(`Active locked amount: ${formatBSV(activeLocked)} BSV`);
        
        // Calculate percentage
        const percentage = calculatePercentage(activeLocked, totalLockedAmount);
        console.log(`PERCENTAGE: ${percentage}%`);
        
        if (percentage === 0 && activeLocked > 0) {
          console.log('ERROR: Percentage is 0% but active locked amount is > 0!');
        }
        
        // Compare with lock_amount
        console.log(`Option lock_amount: ${option.lock_amount || 0}`);
        if (activeLocked !== option.lock_amount) {
          console.log(`Discrepancy between calculated active locked (${activeLocked}) and option.lock_amount (${option.lock_amount || 0})`);
        }
      }
    });
    
    // Check PostGrid percentage calculation
    console.log(`\n=== PostGrid Percentage Calculation ===`);
    console.log('The PostGrid component calculates percentages as:');
    post.vote_options.forEach((option, index) => {
      const optionLockedAmount = calculateActiveLocked(option.lock_likes, currentBlockHeight);
      const percentage = calculatePercentage(optionLockedAmount, totalLockedAmount);
      console.log(`Option "${option.content}": ${percentage}%`);
      
      // Add more detail on percentage calculation
      console.log(`  - Active locked amount: ${optionLockedAmount} satoshis`);
      console.log(`  - Total locked amount: ${totalLockedAmount} satoshis`);
      console.log(`  - Calculation: (${optionLockedAmount} / ${totalLockedAmount}) * 100 = ${percentage}%`);
    });
    
    console.log(`\n=== Debug Information ===`);
    console.log(`PostGrid uses calculatePercentage(optionLockedAmount, totalLocked)`);
    console.log(`where totalLocked is calculated from all vote options' active locked amounts`);
    console.log(`and optionLockedAmount is calculated from each option's active locks`);
    
    console.log('\nTest completed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
main(); 