import prisma from '../db.js';
import logger from '../services/logger.js';

/**
 * Sync vote options for all vote posts
 */
async function syncVoteOptions(): Promise<void> {
  try {
    logger.info('Starting vote options synchronization');
    
    // Get all vote posts
    const votePosts = await prisma.post.findMany({
      where: { is_vote: true },
      include: {
        vote_options: true
      }
    });
    
    logger.info(`Found ${votePosts.length} vote posts to process`);
    
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each vote post
    for (const post of votePosts) {
      try {
        // Skip if post already has vote options
        if (post.vote_options.length > 0) {
          logger.info(`Post ${post.id} already has ${post.vote_options.length} vote options, skipping`);
          skippedCount++;
          continue;
        }
        
        // Extract vote options from metadata
        const metadata = post.metadata as any;
        let voteOptions: string[] = [];
        
        if (metadata?.vote_options && Array.isArray(metadata.vote_options)) {
          voteOptions = metadata.vote_options;
        } else if (metadata?.options && Array.isArray(metadata.options)) {
          voteOptions = metadata.options;
        }
        
        // If no vote options found in metadata, use default options
        if (voteOptions.length === 0) {
          voteOptions = ['Yes', 'No'];
        }
        
        // Create vote options
        for (let i = 0; i < voteOptions.length; i++) {
          const optionContent = typeof voteOptions[i] === 'string' 
            ? voteOptions[i] 
            : voteOptions[i]?.content || voteOptions[i]?.text || `Option ${i + 1}`;
            
          await prisma.vote_option.create({
            data: {
              tx_id: `${post.tx_id}_option_${i}`,
              content: optionContent,
              post_id: post.id,
              author_address: post.author_address || '',
              created_at: post.created_at,
              option_index: i,
              tags: []
            }
          });
        }
        
        logger.info(`Created ${voteOptions.length} vote options for post ${post.id}`);
        createdCount += voteOptions.length;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error processing vote options for post ${post.id}: ${errorMessage}`);
      }
    }
    
    logger.info('Vote options synchronization completed');
    logger.info(`Total vote posts processed: ${votePosts.length}`);
    logger.info(`Total vote options created: ${createdCount}`);
    logger.info(`Total posts skipped: ${skippedCount}`);
    logger.info(`Total errors: ${errorCount}`);
    
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Sync failed: ${errorMessage}`);
    process.exit(1);
  }
}

// Run the sync
syncVoteOptions(); 