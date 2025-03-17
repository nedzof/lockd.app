/**
 * Test script for adding vote options to a post
 * 
 * Usage:
 * ts-node src/scripts/test-vote-options.ts <post_id>
 */

import fetch from 'node-fetch';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3003';

async function addVoteOptionsToPost(postId: string, vote_options: string[]) {
  console.log(`Adding vote options to post: ${postId}`);
  console.log(`Vote options: ${vote_options.join(', ')}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/vote-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vote_options })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log('Success!');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: ts-node src/scripts/test-vote-options.ts <post_id>');
    process.exit(1);
  }
  
  const postId = args[0];
  const vote_options = ['Yes', 'No', 'Maybe', 'Not sure'];
  
  await addVoteOptionsToPost(postId, vote_options);
}

main().catch(console.error); 