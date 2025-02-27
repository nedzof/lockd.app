// Script to add option_index field to existing vote options
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function addOptionIndexToVoteOptions() {
  try {
    console.log('Starting migration to add option_index to vote options...');
    
    // Get all posts that are votes
    const votePosts = await prisma.post.findMany({
      where: {
        is_vote: true
      },
      include: {
        vote_options: true
      }
    });
    
    console.log(`Found ${votePosts.length} vote posts to process`);
    
    // For each vote post, update its options with an index
    for (const post of votePosts) {
      console.log(`Processing vote post ${post.id} with ${post.vote_options.length} options`);
      
      // Sort options by created_at to maintain order
      const sortedOptions = [...post.vote_options].sort((a, b) => 
        a.created_at.getTime() - b.created_at.getTime()
      );
      
      // Update each option with its index
      for (let i = 0; i < sortedOptions.length; i++) {
        const option = sortedOptions[i];
        console.log(`Updating option ${option.id} with index ${i}`);
        
        await prisma.voteOption.update({
          where: { id: option.id },
          data: { option_index: i }
        });
      }
      
      console.log(`Completed processing for post ${post.id}`);
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
addOptionIndexToVoteOptions();
