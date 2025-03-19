import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function testScheduledPostProcessing() {
  const apiEndpoint = 'http://localhost:3003/api/posts';
  
  // Schedule post for 5 seconds in the future
  const scheduledTime = new Date(Date.now() + 5 * 1000).toISOString();
  
  console.log(`Creating post scheduled for 5 seconds in the future: ${scheduledTime}`);
  
  // Create post with frontend structure
  const frontendStructuredPost = {
    tx_id: `quick_schedule_${Date.now()}`,
    content: "This post should be published in 5 seconds",
    author_address: "test_author",
    created_at: new Date().toISOString(),
    is_vote: false,
    is_locked: false,
    tags: ["test", "quick", "scheduled"],
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
    // Send post creation request
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
    
    // Verify post details
    const initialCheckResponse = await fetch(`${apiEndpoint}/${createdPost.id}`);
    if (!initialCheckResponse.ok) {
      throw new Error(`Failed to retrieve post: ${await initialCheckResponse.text()}`);
    }
    
    const initialPost = await initialCheckResponse.json();
    console.log('\nInitial post state:');
    console.log('Content:', initialPost.content);
    console.log('scheduled_at:', initialPost.scheduled_at);
    console.log('metadata:', JSON.stringify(initialPost.metadata, null, 2));
    
    // Wait 7 seconds to ensure the scheduled time has passed
    console.log('\nWaiting 7 seconds for scheduled time to pass...');
    await new Promise(resolve => setTimeout(resolve, 7000));
    
    // Run the scheduled posts processor
    console.log('\nRunning scheduled posts processor...');
    try {
      const { stdout, stderr } = await execPromise('npx tsx src/jobs/scheduled-posts.ts');
      console.log('Processor output:', stdout);
      if (stderr) console.error('Processor errors:', stderr);
    } catch (error) {
      console.error('Error running processor:', error);
    }
    
    // Check post after processing
    console.log('\nChecking post after processing...');
    const finalCheckResponse = await fetch(`${apiEndpoint}/${createdPost.id}`);
    if (!finalCheckResponse.ok) {
      throw new Error(`Failed to retrieve post after processing: ${await finalCheckResponse.text()}`);
    }
    
    const finalPost = await finalCheckResponse.json();
    console.log('\nFinal post state:');
    console.log('Content:', finalPost.content);
    console.log('scheduled_at:', finalPost.scheduled_at);
    console.log('metadata:', JSON.stringify(finalPost.metadata, null, 2));
    
    // Verify the post was processed correctly
    if (finalPost.scheduled_at === null) {
      console.log('\n✅ SUCCESS: Post was correctly processed and published!');
    } else {
      console.log('\n❌ FAILURE: Post still has scheduled_at date after processing.');
    }
    
    return finalPost;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testScheduledPostProcessing()
  .then(() => {
    console.log('\nTest completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 