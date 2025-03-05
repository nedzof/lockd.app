import { BsvContentParser } from './src/parser/bsv_content_parser.js';
import { logger } from './src/utils/logger.js';

// Example transaction from the request
const exampleTx = {
  "id": "8ee0654e57143665976bb24b4c443c4e8a781aa32b2182cb2d23205e4d97c50e",
  "transaction": "AQAAAAGkbp3dcLt+t9U0VUwarFwWzxvVyYQmKSa1AmcjQUsQ4AQAAABrSDBFAiEAx/OPLwjulcGM2lCdzeALkBsCC2lYdledzUIm/HRzF/4CIFgPE4UdsUJJ5W/NueVjk41YZwuKFrOCwt2wkDLjw9UsQSEDf4TPeTy7nLsMlhGz8e4HGZVa4YRSEPuxAYzJTGQIaHj/////BoAAAAAAAAAA/XQBAGMDb3JkUQp0ZXh0L3BsYWluAAZmZWIgMjdodqkUKCPx76IpF7ulyXiD+N+2f6o1u4OIrGoiMVB1UWE3SzYyTWlLQ3Rzc1NMS3kxa2g1NldXVTdNdFVSNQNTRVQDYXBwCWxvY2tkLmFwcAdjb250ZW50BmZlYiAyNwlpc19sb2NrZWQFZmFsc2UHaXNfdm90ZQR0cnVlC29wdGlvbnNIYXNoQDE4NWQ4NmFiZTY0YjNlN2M2NzhiMTE3ZmJhZmYwZWNhM2U2ZWU2YTRiMjdkYTFlNjkzYjYzNWYyNWE3NmYzYjMOcGFyZW50U2VxdWVuY2UBMAZwb3N0SWQSbTducXowbXotenFvanU1ODlkCHNlcXVlbmNlATEEdGFncwJbXQl0aW1lc3RhbXAYMjAyNS0wMi0yN1QxOTozODozMy42NDFaDHRvdGFsT3B0aW9ucwE0BHR5cGUNdm90ZV9xdWVzdGlvbgd2ZXJzaW9uBTEuMC4wKAMAAAAAAAD9GAEAYwNvcmRRCnRleHQvcGxhaW4ACDEgZmViIDI3aHapFCgj8e+iKRe7pcl4g/jftn+qNbuDiKxqIjFQdVFhN0s2Mk1pS0N0c3NTTEt5MWtoNTZXV1U3TXRVUjUDU0VUA2FwcAlsb2NrZC5hcHAHY29udGVudAgxIGZlYiAyNwdpc192b3RlBHRydWULb3B0aW9uSW5kZXgBMA5wYXJlbnRTZXF1ZW5jZQEwBnBvc3RJZBJtN25xejBtei16cW9qdTU4OWQIc2VxdWVuY2UBMgR0YWdzAltdCXRpbWVzdGFtcBgyMDI1LTAyLTI3VDE5OjM4OjMzLjkyMloEdHlwZQt2b3RlX29wdGlvbgd2ZXJzaW9uBTEuMC4wKAMAAAAAAAD9GAEAYwNvcmRRCnRleHQvcGxhaW4ACDIgZmViIDI3aHapFCgj8e+iKRe7pcl4g/jftn+qNbuDiKxqIjFQdVFhN0s2Mk1pS0N0c3NTTEt5MWtoNTZXV1U3TXRVUjUDU0VUA2FwcAlsb2NrZC5hcHAHY29udGVudAgyIGZlYiAyNwdpc192b3RlBHRydWULb3B0aW9uSW5kZXgBMQ5wYXJlbnRTZXF1ZW5jZQEwBnBvc3RJZBJtN25xejBtei16cW9qdTU4OWQIc2VxdWVuY2UBMwR0YWdzAltdCXRpbWVzdGFtcBgyMDI1LTAyLTI3VDE5OjM4OjMzLjkyMloEdHlwZQt2b3RlX29wdGlvbgd2ZXJzaW9uBTEuMC4wKAMAAAAAAAD9GAEAYwNvcmRRCnRleHQvcGxhaW4ACDMgZmViIDI3aHapFCgj8e+iKRe7pcl4g/jftn+qNbuDiKxqIjFQdVFhN0s2Mk1pS0N0c3NTTEt5MWtoNTZXV1U3TXRVUjUDU0VUA2FwcAlsb2NrZC5hcHAHY29udGVudAgzIGZlYiAyNwdpc192b3RlBHRydWULb3B0aW9uSW5kZXgBMg5wYXJlbnRTZXF1ZW5jZQEwBnBvc3RJZBJtN25xejBtei16cW9qdTU4OWQIc2VxdWVuY2UBNAR0YWdzAltdCXRpbWVzdGFtcBgyMDI1LTAyLTI3VDE5OjM4OjMzLjkyMloEdHlwZQt2b3RlX29wdGlvbgd2ZXJzaW9uBTEuMC4wKAMAAAAAAAD9GAEAYwNvcmRRCnRleHQvcGxhaW4ACDQgZmViIDI3aHapFCgj8e+iKRe7pcl4g/jftn+qNbuDiKxqIjFQdVFhN0s2Mk1pS0N0c3NTTEt5MWtoNTZXV1U3TXRVUjUDU0VUA2FwcAlsb2NrZC5hcHAHY29udGVudAg0IGZlYiAyNwdpc192b3RlBHRydWULb3B0aW9uSW5kZXgBMw5wYXJlbnRTZXF1ZW5jZQEwBnBvc3RJZBJtN25xejBtei16cW9qdTU4OWQIc2VxdWVuY2UBNQR0YWdzAltdCXRpbWVzdGFtcBgyMDI1LTAyLTI3VDE5OjM4OjMzLjkyMloEdHlwZQt2b3RlX29wdGlvbgd2ZXJzaW9uBTEuMC4wxDdfAgAAAAAZdqkUKCPx76IpF7ulyXiD+N+2f6o1u4OIrAAAAAA=",
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
 * Test the BSV Content Parser with the example transaction
 */
async function testBsvContentParser() {
  try {
    logger.info('🧪 Testing BSV Content Parser with example transaction', { tx_id: exampleTx.id });
    
    // Create a new instance of the parser
    const parser = new BsvContentParser();
    
    // Extract the vote content from the transaction data array
    const voteContent = parser.extractVoteContent(exampleTx.data);
    
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
    
    // Compare with the data array from the transaction
    logger.info('🔍 Comparing with transaction data array');
    
    // Find the question content in the data array
    const questionContent = exampleTx.data.find(item => 
      item.startsWith('content=') && 
      !item.match(/content=\d+\s/)
    );
    
    if (questionContent) {
      const extractedQuestion = questionContent.replace('content=', '');
      logger.info('📋 Question from data array', { 
        content: extractedQuestion,
        matches: extractedQuestion === voteContent.question ? '✅ MATCH' : '❌ MISMATCH'
      });
    }
    
    // Find the option contents in the data array
    const optionContents = exampleTx.data.filter(item => 
      item.startsWith('content=') && 
      item.match(/content=\d+\s/)
    );
    
    optionContents.forEach((item, index) => {
      const extractedOption = item.replace('content=', '');
      logger.info(`📋 Option ${index + 1} from data array`, { 
        content: extractedOption,
        matches: extractedOption === voteContent.options[index] ? '✅ MATCH' : '❌ MISMATCH'
      });
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
    logger.error('❌ Error testing BSV Content Parser', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the test
testBsvContentParser().catch(e => {
  logger.error(e);
  process.exit(1);
});
