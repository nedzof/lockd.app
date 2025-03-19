import fetch from 'node-fetch';

// API endpoint for creating posts
const API_ENDPOINT = 'http://localhost:3003/api/posts';

// Future date for scheduling
const scheduledTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in the future

// Sample post with scheduled data
const scheduledPost = {
  tx_id: `test_scheduled_${Date.now()}`,
  content: "This is a test scheduled post",
  author_address: "test_author",
  tags: ["test", "scheduled"],
  is_vote: false,
  // Send scheduled in the format expected by the API
  scheduled: {
    scheduledAt: scheduledTime.toISOString(),
    timezone: "Europe/Berlin"
  },
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

async function testScheduledPost() {
  try {
    console.log('Sending test scheduled post to API...');
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
    
    // Check if the post was actually created with scheduled_at
    console.log('Checking if post was created with scheduled_at...');
    
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

testScheduledPost(); 