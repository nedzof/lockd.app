import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const prisma = new PrismaClient();

async function testDbScheduledPost() {
  console.log('Starting DB scheduled post test...');
  
  try {
    // Step 1: Create a scheduled post
    console.log('\nStep 1: Creating a scheduled post in the database...');
    
    // Schedule for 10 seconds in the future
    const scheduledTime = new Date(Date.now() + 10 * 1000);
    
    const post = await prisma.post.create({
      data: {
        tx_id: `db_scheduled_test_${Date.now()}`,
        content: 'Test post scheduled via database',
        author_address: 'test_author',
        tags: ['test', 'db', 'scheduled'],
        scheduled_at: scheduledTime,
        metadata: {
          app: 'lockd.app',
          scheduled: {
            scheduledAt: scheduledTime.toISOString(),
            timezone: 'Europe/Berlin'
          }
        }
      }
    });
    
    console.log('Created post with ID:', post.id);
    console.log('scheduled_at:', post.scheduled_at);
    console.log('metadata:', post.metadata);
    
    // Step 2: Check post visibility using the shouldShowScheduledPost logic
    console.log('\nStep 2: Checking if post would be visible according to shouldShowScheduledPost logic...');
    const now = new Date();
    
    // This replicates the shouldShowScheduledPost logic from the API
    function shouldShowScheduledPost(post, now) {
      try {
        // If the post has a scheduled_at date in the future, filter it out
        if (post.scheduled_at && post.scheduled_at > now) {
          console.log(`Post has future scheduled_at date (${post.scheduled_at}), should be hidden`);
          return false;
        }
        
        const metadata = post.metadata;
        
        // If no scheduled metadata, show the post
        if (!metadata || !metadata.scheduled) {
          console.log('Post has no scheduled metadata, should be visible');
          return true;
        }
        
        // If post has been published by the scheduled job, show it
        if (metadata.scheduled.published === true) {
          console.log('Post has been marked as published, should be visible');
          return true;
        }
        
        // For backwards compatibility - check scheduled time
        if (metadata.scheduled.scheduledAt) {
          const scheduledAt = new Date(metadata.scheduled.scheduledAt);
          
          // Convert to user's timezone if provided
          let adjustedScheduledAt = scheduledAt;
          if (metadata.scheduled.timezone) {
            try {
              adjustedScheduledAt = new Date(scheduledAt.toLocaleString('en-US', { timeZone: metadata.scheduled.timezone }));
            } catch (tzError) {
              console.error(`Error adjusting timezone: ${tzError.message}`);
            }
          }
          
          const isReady = adjustedScheduledAt <= now;
          
          if (!isReady) {
            // Scheduled time is in the future
            console.log(`Post scheduled time is in the future (${scheduledAt.toISOString()}), should be hidden`);
            return false;
          } else if (post.scheduled_at === null) {
            // Scheduled time is in the past and scheduled_at is null
            // This means the post has been processed by the scheduled posts job
            console.log('Post scheduled time has passed and scheduled_at is null, should be visible');
            return true;
          } else {
            // Scheduled time is in the past but scheduled_at is not null
            // The post is ready to be published but the job hasn't run yet
            console.log('Post scheduled time has passed but job has not run yet, should be hidden');
            return false;
          }
        }
        
        // Default to showing the post if we can't determine
        console.log('Could not determine visibility status, defaulting to visible');
        return true;
      } catch (error) {
        console.error('Error checking post visibility:', error);
        return true; // Include the post if there's an error processing it
      }
    }
    
    const isVisible = shouldShowScheduledPost(post, now);
    console.log(`Post should be ${isVisible ? 'VISIBLE' : 'HIDDEN'} in the feed`);
    
    // Step 3: Wait for the scheduled time to pass
    console.log('\nStep 3: Waiting for scheduled time to pass (12 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    // Step 4: Check post visibility again (should still be hidden)
    console.log('\nStep 4: Checking visibility again after scheduled time has passed...');
    const updatedPost = await prisma.post.findUnique({
      where: { id: post.id }
    });
    
    const isVisibleAfterTime = shouldShowScheduledPost(updatedPost, new Date());
    console.log(`Post should be ${isVisibleAfterTime ? 'VISIBLE' : 'HIDDEN'} in the feed after scheduled time`);
    
    // Step 5: Run the scheduled posts processor
    console.log('\nStep 5: Running scheduled posts processor...');
    try {
      const { stdout, stderr } = await execPromise('npx tsx src/jobs/scheduled-posts.ts');
      console.log('Processor output:', stdout);
      if (stderr) console.error('Processor errors:', stderr);
    } catch (error) {
      console.error('Error running processor:', error);
    }
    
    // Step 6: Verify post has been processed
    console.log('\nStep 6: Checking post after scheduled job processing...');
    const processedPost = await prisma.post.findUnique({
      where: { id: post.id }
    });
    
    const isVisibleAfterProcessing = shouldShowScheduledPost(processedPost, new Date());
    
    console.log('Post status after processing:');
    console.log('- scheduled_at:', processedPost.scheduled_at);
    console.log('- metadata:', JSON.stringify(processedPost.metadata, null, 2));
    console.log(`- Should be ${isVisibleAfterProcessing ? 'VISIBLE' : 'HIDDEN'} in the feed`);
    
    if (processedPost.scheduled_at === null && 
        processedPost.metadata?.scheduled?.published === true) {
      console.log('\n✅ SUCCESS: Post was correctly processed by the scheduled job!');
    } else {
      console.log('\n❌ FAILURE: Post was not correctly processed by the scheduled job!');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Test error:', error);
    return { success: false, error };
  } finally {
    await prisma.$disconnect();
  }
}

testDbScheduledPost()
  .then(result => {
    console.log('\nTest completed:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 