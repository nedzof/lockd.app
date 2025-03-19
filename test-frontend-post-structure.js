import fetch from 'node-fetch';

async function testFrontendPostStructure() {
  const apiEndpoint = 'http://localhost:3003/api/posts';
  
  // Schedule post for 5 minutes in the future
  const scheduledTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  
  // Create post object with the same structure as frontend sends
  const frontendStructuredPost = {
    tx_id: `frontend_structure_${Date.now()}`,
    content: "Test post with frontend structure",
    author_address: "test_author",
    created_at: new Date().toISOString(),
    is_vote: false,
    is_locked: false,
    tags: ["test", "frontend", "structure"],
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
    // Note: We're intentionally NOT including scheduled_at field directly
    // as it appears frontend isn't sending it directly
  };
  
  console.log(`Testing post creation with frontend structure...`);
  console.log(`Scheduled time: ${scheduledTime}`);
  
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
    console.log('\nRetrieved post details:');
    console.log('Content:', post.content);
    console.log('scheduled_at:', post.scheduled_at);
    console.log('metadata:', JSON.stringify(post.metadata, null, 2));
    
    return post;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testFrontendPostStructure()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 