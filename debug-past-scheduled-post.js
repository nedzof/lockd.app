import fetch from 'node-fetch';

// API endpoint for creating posts
const API_ENDPOINT = 'http://localhost:3003/api/posts';

// Past date for scheduling (5 minutes ago)
const scheduledTime = new Date(Date.now() - 5 * 60 * 1000);

// Sample post with scheduled data
const scheduledPost = {
  tx_id: `test_scheduled_past_${Date.now()}`,
  content: "This is a test post scheduled in the past",
  author_address: "test_author",
  tags: ["test", "scheduled", "past"],
  is_vote: false,
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

async function testPastScheduledPost() {
  try {
    console.log('Sending test post scheduled in the past to API...');
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
    
    // Run the scheduled posts processor to see if it picks up the post
    console.log('\nNow running the scheduled posts processor to see if it picks up our post...');
    
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const { processScheduledPosts } = await import('./src/jobs/scheduled-posts.js');
      
      const result = await processScheduledPosts();
      console.log('Scheduled posts processor result:', result);
    } catch (error) {
      console.error('Error running scheduled posts processor:', error);
      console.log('Trying alternative method to run the processor...');
      
      const { exec } = await import('child_process');
      exec('npx tsx src/jobs/scheduled-posts.ts', (error, stdout, stderr) => {
        if (error) {
          console.error('Error running scheduled posts processor:', error);
          return;
        }
        if (stderr) {
          console.error('Stderr from processor:', stderr);
        }
        console.log('Stdout from processor:', stdout);
      });
    }
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testPastScheduledPost(); 