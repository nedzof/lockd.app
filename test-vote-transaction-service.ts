import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';
import { VoteTransactionService } from './src/services/vote-transaction-service.js';

// Example transaction from the request
const exampleTx = {
  "id": "8ee0654e57143665976bb24b4c443c4e8a781aa32b2182cb2d23205e4d97c50e",
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

/**
 * Main function to run the test
 */
async function main() {
  const prisma = new PrismaClient();
  
  try {
    logger.info('🧪 Testing VoteTransactionService');
    
    // Create a new instance of the service
    const voteService = new VoteTransactionService(prisma);
    
    // Process the example transaction
    logger.info('Processing vote transaction', { tx_id: exampleTx.id });
    const result = await voteService.processVoteTransaction(exampleTx);
    
    if (result) {
      logger.info('✅ Transaction processed successfully', { 
        post_id: result.post.id,
        vote_options_count: result.voteOptions.length
      });
      
      // Display the post details
      logger.info('📝 Post Details', {
        id: result.post.id,
        tx_id: result.post.tx_id,
        content: result.post.content,
        is_vote: result.post.is_vote,
        is_locked: result.post.is_locked,
        created_at: result.post.created_at
      });
      
      // Display each vote option
      result.voteOptions.forEach((option, index) => {
        logger.info(`📌 Option ${index + 1}`, {
          id: option.id,
          content: option.content,
          option_index: option.option_index
        });
      });
      
      // Retrieve the vote details from the database
      logger.info('Retrieving vote details from database');
      const voteDetails = await voteService.getVoteDetails(result.post.id);
      
      if (voteDetails) {
        logger.info('📊 Retrieved Vote Details', {
          post_id: voteDetails.id,
          question: voteDetails.content,
          options_count: voteDetails.vote_options.length
        });
      }
    } else {
      logger.warn('⚠️ Transaction was not processed (may already exist)');
      
      // Try to find the post by tx_id
      const existingPost = await prisma.post.findFirst({
        where: { tx_id: exampleTx.id },
        include: {
          vote_options: {
            orderBy: { option_index: 'asc' }
          }
        }
      });
      
      if (existingPost) {
        logger.info('📝 Found Existing Post', {
          id: existingPost.id,
          tx_id: existingPost.tx_id,
          content: existingPost.content,
          is_vote: existingPost.is_vote,
          vote_options_count: existingPost.vote_options.length
        });
      }
    }
    
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the main function
main().catch(e => {
  logger.error(e);
  process.exit(1);
});
