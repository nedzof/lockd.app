import fetch from 'node-fetch';

async function testPastScheduledPost() {
  const apiEndpoint = 'http://localhost:3003/api/posts';
  
  // Schedule post for 1 minute in the past
  const pastTime = new Date(Date.now() - 60 * 1000).toISOString();
  
  // Create post object with the same structure as frontend sends
  const frontendStructuredPost = {
    tx_id: `frontend_past_${Date.now()}`,
    content: "Test post with past scheduled time (frontend structure)",
    author_address: "test_author",
    created_at: new Date().toISOString(),
    is_vote: false,
    is_locked: false,
    tags: ["test", "frontend", "past"],
    metadata: {
      app: "lockd.app",
      scheduled: {
        scheduledAt: pastTime,
        timezone: "Europe/Berlin"
      },
      sequence: 0,
      type: "content",
      version: "1.0.0"
    }
  };
  
  console.log(`Testing post creation with past scheduled time...`);
  console.log(`Scheduled time (past): ${pastTime}`);
  
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
    
    // Verify post details by fetching it
    const getResponse = await fetch(`${apiEndpoint}/${createdPost.id}`);
    if (!getResponse.ok) {
      throw new Error(`Failed to retrieve post: ${await getResponse.text()}`);
    }
    
    const post = await getResponse.json();
    console.log('\nCreated post details:');
    console.log('Content:', post.content);
    console.log('scheduled_at:', post.scheduled_at);
    console.log('metadata:', JSON.stringify(post.metadata, null, 2));
    
    // Now run the scheduled posts processor
    console.log('\nRunning scheduled posts processor...');
    
    // Wait a bit for database consistency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check post after processing
    const finalCheckResponse = await fetch(`${apiEndpoint}/${createdPost.id}`);
    if (!finalCheckResponse.ok) {
      throw new Error(`Failed to retrieve post after processing: ${await finalCheckResponse.text()}`);
    }
    
    const finalPost = await finalCheckResponse.json();
    console.log('\nPost after processing:');
    console.log('Content:', finalPost.content);
    console.log('scheduled_at:', finalPost.scheduled_at);
    console.log('metadata:', JSON.stringify(finalPost.metadata, null, 2));
    
    return finalPost;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testPastScheduledPost()
  .then(() => {
    console.log('\nTest completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 