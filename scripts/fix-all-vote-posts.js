import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAllVotePosts() {
  try {
    console.log('Fixing all vote posts...');
    
    // Find all posts that are marked as vote posts
    const votePosts = await prisma.post.findMany({
      where: {
        is_vote: true
      },
      include: {
        vote_options: true
      }
    });
    
    console.log(`Found ${votePosts.length} vote posts to update`);
    
    // Update each vote post to ensure it has the correct metadata
    for (const post of votePosts) {
      console.log(`Processing post with TXID: ${post.txid}`);
      
      // Create or update metadata with content_type set to 'vote'
      const metadata = {
        ...(post.metadata || {}),
        type: 'vote',
        description: post.content || 'Vote post'
      };
      
      // Update the post
      const updatedPost = await prisma.post.update({
        where: {
          id: post.id
        },
        data: {
          metadata: metadata
        }
      });
      
      console.log(`Updated post: ${post.id}`);
      
      // If the post has no vote options, create some default ones
      if (post.vote_options.length === 0) {
        console.log(`Post ${post.id} has no vote options. Creating default options...`);
        
        // Create default vote options
        const options = ['Yes', 'No', 'Maybe'];
        
        for (let i = 0; i < options.length; i++) {
          const optionTxid = `${post.txid}-option-${i}`;
          
          // Check if option already exists
          const existingOption = await prisma.voteOption.findUnique({
            where: {
              txid: optionTxid
            }
          });
          
          if (!existingOption) {
            const voteOption = await prisma.voteOption.create({
              data: {
                content: options[i],
                post_id: post.id,
                txid: optionTxid,
                lock_duration: 1000
              }
            });
            
            console.log(`Created vote option: ${voteOption.id}`);
          }
        }
      }
    }
    
    console.log('All vote posts have been fixed!');
  } catch (error) {
    console.error('Error fixing vote posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllVotePosts();
