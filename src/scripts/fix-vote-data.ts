import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { LockProtocolParser } from '../parser/lock_protocol_parser.js';

/**
 * Fix vote data for existing transactions
 */
async function fixVoteData() {
  const prisma = new PrismaClient();
  const parser = new LockProtocolParser();
  
  try {
    logger.info('🔧 Starting vote data fix process');
    
    // Find the specific transaction we want to fix
    const txId = '8ee0654e57143665976bb24b4c443c4e8a781aa32b2182cb2d23205e4d97c50e';
    
    // Get the transaction data from processed_transaction table
    const processedTx = await prisma.processed_transaction.findUnique({
      where: { tx_id: txId }
    });
    
    if (!processedTx) {
      logger.error(`Transaction ${txId} not found in processed_transaction table`);
      return;
    }
    
    // Find the post associated with this transaction
    const post = await prisma.post.findUnique({
      where: { tx_id: txId },
      include: { vote_options: true }
    });
    
    if (!post) {
      logger.error(`Post for transaction ${txId} not found`);
      return;
    }
    
    logger.info('Found post to fix', {
      post_id: post.id,
      tx_id: post.tx_id,
      content: post.content,
      is_vote: post.is_vote
    });
    
    // Example transaction data
    const exampleTx = {
      "id": txId,
      "block_hash": "00000000000000000b20b9893336afdd7e77d9c06411ba85bd3fef42b7bbf784",
      "block_height": 885887,
      "block_time": 1740685516,
      "block_index": 1223,
      "data": [
        "app=lockd.app",
        "cmd=set",
        "content=1 feb 27",
        "content=2 feb 27",
        "content=3 feb 27",
        "content=4 feb 27",
        "content=feb 27",
        "is_locked=false",
        "is_vote=true",
        "optionindex=0",
        "optionindex=1",
        "optionindex=2",
        "optionindex=3",
        "optionshash=185d86abe64b3e7c678b117fbaff0eca3e6ee6a4b27da1e693b635f25a76f3b3",
        "parentsequence=0",
        "postid=m7nqz0mz-zqoju589d",
        "sequence=1",
        "sequence=2",
        "sequence=3",
        "sequence=4",
        "sequence=5",
        "tags=[]",
        "timestamp=2025-02-27t19:38:33.641z",
        "timestamp=2025-02-27t19:38:33.922z",
        "totaloptions=4",
        "type=vote_option",
        "type=vote_question",
        "version=1.0.0"
      ]
    };
    
    // Parse the transaction data
    const lockData = parser.extract_lock_protocol_data(exampleTx);
    
    if (!lockData) {
      logger.error('Failed to extract lock protocol data');
      return;
    }
    
    logger.info('Extracted lock protocol data', {
      vote_question: lockData.vote_question,
      vote_options: lockData.vote_options,
      total_options: lockData.total_options
    });
    
    // Start a transaction to update the post and create vote options
    await prisma.$transaction(async (tx) => {
      // Update the post to mark it as a vote and set the correct content
      await tx.post.update({
        where: { id: post.id },
        data: {
          is_vote: true,
          content: lockData.vote_question || 'feb 27',
          metadata: {
            ...post.metadata,
            options_hash: lockData.options_hash,
            total_options: lockData.total_options
          }
        }
      });
      
      logger.info('Updated post to mark as vote', { post_id: post.id });
      
      // Create vote options if they don't exist
      if (lockData.vote_options && lockData.vote_options.length > 0) {
        // Delete any existing vote options
        if (post.vote_options.length > 0) {
          await tx.vote_option.deleteMany({
            where: { post_id: post.id }
          });
          
          logger.info('Deleted existing vote options', { count: post.vote_options.length });
        }
        
        // Create new vote options
        for (let i = 0; i < lockData.vote_options.length; i++) {
          const option = lockData.vote_options[i];
          
          await tx.vote_option.create({
            data: {
              content: option,
              post_id: post.id,
              author_address: post.author_address,
              created_at: post.created_at,
              tx_id: `${post.tx_id}-option-${i}`,
              option_index: i,
              tags: []
            }
          });
        }
        
        logger.info('Created vote options', { count: lockData.vote_options.length });
      }
      
      // Update the processed_transaction record
      await tx.processed_transaction.update({
        where: { tx_id: txId },
        data: {
          type: 'vote',
          metadata: {
            ...processedTx.metadata,
            vote_question: lockData.vote_question,
            total_options: lockData.total_options
          }
        }
      });
      
      logger.info('Updated processed_transaction record', { tx_id: txId });
    });
    
    // Verify the changes
    const updatedPost = await prisma.post.findUnique({
      where: { id: post.id },
      include: {
        vote_options: {
          orderBy: { option_index: 'asc' }
        }
      }
    });
    
    if (updatedPost) {
      logger.info('✅ Successfully fixed vote data', {
        post_id: updatedPost.id,
        is_vote: updatedPost.is_vote,
        content: updatedPost.content,
        vote_options_count: updatedPost.vote_options.length
      });
      
      // Display each option
      updatedPost.vote_options.forEach((option, index) => {
        logger.info(`📌 Option ${index + 1}`, {
          id: option.id,
          content: option.content,
          option_index: option.option_index
        });
      });
    }
    
  } catch (error) {
    logger.error('❌ Error fixing vote data', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Main function to run the script
 */
async function main() {
  try {
    await fixVoteData();
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === import.meta.resolve('./fix-vote-data.ts')) {
  main().catch(e => {
    logger.error(e);
    process.exit(1);
  });
}

export { fixVoteData };
