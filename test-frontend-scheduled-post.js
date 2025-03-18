import fetch from 'node-fetch';

// API endpoint for creating posts
const API_ENDPOINT = 'http://localhost:3003/api/posts';

// Future date for scheduling
const scheduledTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in the future

// Sample post with scheduled data structured exactly like the frontend sends it
const scheduledPost = {
  tx_id: `test_scheduled_frontend_${Date.now()}`,
  content: "This simulates a frontend scheduled post",
  author_address: "test_author",
  tags: ["test", "scheduled", "frontend"],
  is_vote: false,
  scheduled: {
    scheduledAt: scheduledTime.toISOString(),
    timezone: "Europe/Berlin"
  },
  scheduled_at: scheduledTime, // Explicitly include both scheduled and scheduled_at
  metadata: {
    app: "lockd.app",
    type: "content",
    version: "1.0.0",
    scheduled: {
      scheduledAt: scheduledTime.toISOString(),
      timezone: "Europe/Berlin"
    }
  }
};

async function testFrontendScheduledPost() {
  try {
    console.log('Sending frontend-style scheduled post to API...');
    console.log('Post data:', JSON.stringify(scheduledPost, null, 2));
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(scheduledPost)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error creating post:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return;
    }
    
    const result = await response.json();
    console.log('Post created successfully:', result);
    
    // Check if the post was actually created with both scheduled_at and metadata
    console.log('Checking if post was created with scheduled_at and metadata...');
    
    // Wait a second for the post to be properly saved
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get the created post
    const getResponse = await fetch(`${API_ENDPOINT}/${result.id}`);
    if (!getResponse.ok) {
      console.error('Error getting created post:', getResponse.statusText);
      return;
    }
    
    const createdPost = await getResponse.json();
    console.log('Retrieved created post:', {
      id: createdPost.id,
      content: createdPost.content,
      scheduled_at: createdPost.scheduled_at,
      metadata: createdPost.metadata
    });
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testFrontendScheduledPost(); 