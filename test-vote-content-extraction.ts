import { PrismaClient } from '@prisma/client';
import { logger } from './src/utils/logger.js';
import { LockProtocolParser } from './src/parser/lock_protocol_parser.js';

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
 * Test the vote content extraction with the LockProtocolParser
 */
async function testVoteContentExtraction() {
  try {
    logger.info('🧪 Testing vote content extraction with LockProtocolParser', { tx_id: exampleTx.id });
    
    // Create a new instance of the parser
    const parser = new LockProtocolParser();
    
    // Extract the vote content from the transaction
    const voteContent = parser.extract_vote_content(exampleTx);
    
    // Log the results
    logger.info('📊 Extracted Vote Question', { 
      question: voteContent.question,
      post_id: voteContent.post_id,
      timestamp: voteContent.timestamp,
      total_options: voteContent.total_options,
      is_locked: voteContent.is_locked
    });
    
    // Log each option
    voteContent.options.forEach((option, index) => {
      logger.info(`📌 Option ${index + 1}`, { content: option });
    });
    
    // Now test with the extract_lock_protocol_data method
    logger.info('🧪 Testing with extract_lock_protocol_data method');
    
    const lockData = parser.extract_lock_protocol_data(exampleTx);
    
    logger.info('📊 Extracted Lock Protocol Data', { 
      content: lockData.content,
      post_id: lockData.post_id,
      is_vote: lockData.is_vote,
      is_locked: lockData.is_locked,
      vote_options: lockData.vote_options,
      vote_question: lockData.vote_question
    });
    
    // Generate a summary of the transaction
    logger.info('📝 Transaction Summary', {
      tx_id: exampleTx.id,
      block_height: exampleTx.block_height,
      block_time: new Date(exampleTx.block_time * 1000).toISOString(),
      vote_question: voteContent.question,
      vote_options: voteContent.options,
      total_options: voteContent.total_options,
      is_locked: voteContent.is_locked
    });
    
  } catch (error) {
    logger.error('❌ Error testing vote content extraction', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the test
testVoteContentExtraction().catch(e => {
  logger.error(e);
  process.exit(1);
});
