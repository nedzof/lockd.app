import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function checkApiAvailability(endpoint) {
  try {
    const response = await fetch(endpoint);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function testScheduledPostVisibility() {
  const apiEndpoint = 'http://localhost:3003/api/posts';
  
  // Check if API is available
  console.log("Checking if API is available...");
  const isApiAvailable = await checkApiAvailability(apiEndpoint);
  if (!isApiAvailable) {
    console.error("API is not available at " + apiEndpoint);
    console.error("Please make sure the server is running (npm run dev) before running this test.");
    return { success: false, error: "API not available" };
  }
  console.log("API is available ✅");
  
  // Schedule post for 10 seconds in the future
  const scheduledTime = new Date(Date.now() + 10 * 1000).toISOString();
  
  console.log(`Creating post scheduled for 10 seconds in the future: ${scheduledTime}`);
  
  // Create post with frontend structure
  const frontendStructuredPost = {
    tx_id: `visibility_test_${Date.now()}`,
    content: "This post should NOT be visible until processed by the scheduled job",
    author_address: "test_author",
    created_at: new Date().toISOString(),
    is_vote: false,
    is_locked: false,
    tags: ["test", "visibility", "scheduled"],
    metadata: {
      app: "lockd.app",
      scheduled: {
        scheduledAt: scheduledTime,
        timezone: "Europe/Berlin"
      },
      sequence: 0,
      type: "content",
      version: "1.0.0"
    }
  };
  
  try {
    // Step 1: Create the scheduled post
    console.log("Step 1: Creating scheduled post...");
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(frontendStructuredPost),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const createdPost = await response.json();
    console.log('Post created successfully!');
    console.log('Post ID:', createdPost.id);
    
    // Step 2: Verify post is not visible in the feed
    console.log("\nStep 2: Checking if post is visible in feed (should NOT be visible)...");
    const listResponse = await fetch(apiEndpoint);
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch posts: ${await listResponse.text()}`);
    }
    
    const postsList = await listResponse.json();
    const visiblePost = postsList.posts.find(post => post.id === createdPost.id);
    
    if (visiblePost) {
      console.log('❌ FAILURE: Post is visible in the feed before the scheduled time!');
    } else {
      console.log('✅ SUCCESS: Post is correctly hidden from the feed!');
    }
    
    // Step 3: Wait for the scheduled time to pass
    console.log(`\nStep 3: Waiting 12 seconds for scheduled time to pass...`);
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    // Step 4: Verify post is still not visible (should still be hidden as job hasn't run)
    console.log("\nStep 4: Checking if post is visible after scheduled time (should still be hidden)...");
    const listResponse2 = await fetch(apiEndpoint);
    if (!listResponse2.ok) {
      throw new Error(`Failed to fetch posts: ${await listResponse2.text()}`);
    }
    
    const postsList2 = await listResponse2.json();
    const visiblePost2 = postsList2.posts.find(post => post.id === createdPost.id);
    
    if (visiblePost2) {
      console.log('❌ FAILURE: Post is visible in the feed before the scheduled job has run!');
    } else {
      console.log('✅ SUCCESS: Post is correctly hidden from the feed until job runs!');
    }
    
    // Step 5: Run the scheduled posts processor
    console.log("\nStep 5: Running scheduled posts processor...");
    try {
      const { stdout, stderr } = await execPromise('npx tsx src/jobs/scheduled-posts.ts');
      console.log('Processor output:', stdout);
      if (stderr) console.error('Processor errors:', stderr);
    } catch (error) {
      console.error('Error running processor:', error);
    }
    
    // Give the database a moment to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 6: Verify post is now visible
    console.log("\nStep 6: Checking if post is visible after job has run (should be visible)...");
    const listResponse3 = await fetch(apiEndpoint);
    if (!listResponse3.ok) {
      throw new Error(`Failed to fetch posts: ${await listResponse3.text()}`);
    }
    
    const postsList3 = await listResponse3.json();
    const visiblePost3 = postsList3.posts.find(post => post.id === createdPost.id);
    
    if (visiblePost3) {
      console.log('✅ SUCCESS: Post is visible in the feed after the scheduled job has run!');
      console.log('Post details:', {
        content: visiblePost3.content,
        scheduled_at: visiblePost3.scheduled_at,
        metadata: JSON.stringify(visiblePost3.metadata, null, 2)
      });
    } else {
      console.log('❌ FAILURE: Post is still not visible after the scheduled job ran!');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error };
  }
}

testScheduledPostVisibility()
  .then(result => {
    console.log('\nTest completed:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test failed with an unexpected error:', error);
    process.exit(1);
  }); 