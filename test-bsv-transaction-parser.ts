import { logger } from './src/utils/logger.js';
import { LockProtocolParser } from './src/parser/lock_protocol_parser.js';

/**
 * Test BSV Transaction Parser
 * 
 * This script demonstrates how to parse a BSV transaction to extract vote content
 */

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
 * Parse a BSV transaction and extract vote content
 * 
 * @param tx - The transaction object
 * @returns A summary of the transaction
 */
function parseBsvTransaction(tx: any) {
  try {
    logger.info('🔍 Parsing BSV transaction', { tx_id: tx.id });
    
    // Create a new instance of the parser
    const parser = new LockProtocolParser();
    
    // Extract the lock protocol data
    const lockData = parser.extract_lock_protocol_data(tx);
    
    if (!lockData) {
      logger.error('❌ Failed to extract lock protocol data', { tx_id: tx.id });
      return null;
    }
    
    // Check if this is a vote
    if (!lockData.is_vote) {
      logger.info('ℹ️ This is not a vote transaction', { tx_id: tx.id });
      return {
        tx_id: tx.id,
        block_height: tx.block_height,
        block_time: new Date(tx.block_time * 1000).toISOString(),
        content: lockData.content,
        is_vote: false,
        is_locked: lockData.is_locked
      };
    }
    
    // This is a vote transaction
    logger.info('✅ Found vote transaction', { 
      tx_id: tx.id,
      question: lockData.vote_question,
      options_count: lockData.vote_options?.length || 0
    });
    
    // Return a summary of the transaction
    return {
      tx_id: tx.id,
      block_height: tx.block_height,
      block_time: new Date(tx.block_time * 1000).toISOString(),
      vote_question: lockData.vote_question,
      vote_options: lockData.vote_options,
      total_options: lockData.total_options,
      is_locked: lockData.is_locked,
      post_id: lockData.post_id
    };
  } catch (error) {
    logger.error('❌ Error parsing BSV transaction', {
      error: error instanceof Error ? error.message : String(error),
      tx_id: tx?.id || 'unknown'
    });
    return null;
  }
}

/**
 * Main function to run the test
 */
async function main() {
  try {
    logger.info('🧪 Testing BSV Transaction Parser');
    
    // Parse the example transaction
    const result = parseBsvTransaction(exampleTx);
    
    if (result) {
      logger.info('📝 Transaction Summary', result);
    } else {
      logger.error('❌ Failed to parse transaction');
    }
    
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the main function
main().catch(e => {
  logger.error(e);
  process.exit(1);
});
