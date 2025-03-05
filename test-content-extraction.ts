import { LockProtocolParser } from './src/parser/lock_protocol_parser.js';
import { logger } from './src/utils/logger.js';
import { JungleBusResponse } from './src/shared/types.js';

async function testContentExtraction() {
  const parser = new LockProtocolParser();
  
  // Example transaction data with content in the data array
  const exampleTx: JungleBusResponse = {
    id: "f3d1d14d8a42a6b7e81b43cb9c122920f99cc945dcdf4ac1739a1deebbf3029a",
    transaction: "AQAAAAGD0Z9OPIFa8avJ1RXRLxzL9ijon3tJe8syoWTjf2tEGwEAAABqRzBEAiBedVeFK5/cxozQQcPtJQlwYAFC9i6zWSv6yHNU0G1k7gIgP09AvxcLUPSXQoZpt6sNHf9mWkQeJru9TL8gXyqIBRBBIQKd4jTWzMdUeGQZqKipD0ef2hwOvs/szv1spuOCQXvz6f////8ChAAAAAAAAAD9EAEAYwNvcmRRCnRleHQvcGxhaW4ADUhlbGwgYW5kIGJhY2todqkUwgGzV0wBGPnSEoS5F0mKzZdIEh6IrGoiMVB1UWE3SzYyTWlLQ3Rzc1NMS3kxa2g1NldXVTdNdFVSNQNTRVQDYXBwCWxvY2tkLmFwcAdjb250ZW50DUhlbGwgYW5kIGJhY2sJaXNfbG9ja2VkBWZhbHNlB2lzX3ZvdGUFZmFsc2UGcG9zdElkEm03bnNjdmNiLTI2Y3FpMHByaghzZXF1ZW5jZQEwBHRhZ3MCW10JdGltZXN0YW1wGDIwMjUtMDItMjdUMjA6MTc6MTguMjUxWgR0eXBlB2NvbnRlbnQHdmVyc2lvbgUxLjAuMNPdeQAAAAAAGXapFMIBs1dMARj50hKEuRdJis2XSBIeiKwAAAAA",
    block_hash: "00000000000000000114691fdaafb9d97ae6c3f3660c3f0afa8dc4cbf5180e4c",
    block_height: 885895,
    block_time: 1740687706,
    block_index: 478,
    addresses: [
      "1Jgp8NYXoYEn74pnuEC2uGMoJ2sc17Xttc"
    ],
    inputs: [
      {
        address: "1Jgp8NYXoYEn74pnuEC2uGMoJ2sc17Xttc",
        value: 1000,
        script_sig: ""
      }
    ],
    outputs: [
      "0063036f7264510a746578742f706c61696e000d48656c6c20616e64206261636b6876a914c201b3574c0118f9d21284b917498acd9748121e88ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e740d48656c6c20616e64206261636b0969735f6c6f636b65640566616c73650769735f766f74650566616c736506706f73744964126d376e73637663622d32366371693070726a0873657175656e636501300474616773025b5d0974696d657374616d7018323032352d30322d32375432303a31373a31382e3235315a047479706507636f6e74",
      "76a914c201b3574c0118f9d21284b917498acd9748121e88ac"
    ],
    input_types: [],
    output_types: [
      "nonstandard",
      "ord",
      "pubkeyhash",
      "bitcom",
      "map"
    ],
    contexts: [
      "text/plain",
      "1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5"
    ],
    sub_contexts: [
      "SET"
    ],
    data: [
      "app=lockd.app",
      "content=Hell and back",
      "is_locked=false",
      "is_vote=false",
      "postid=m7nscvcb-26cqi0prj",
      "sequence=0",
      "tags=[]",
      "timestamp=2025-02-27t20:17:18.251z",
      "type=content",
      "version=1.0.0"
    ],
    merkle_proof: null
  };

  // Test with empty data array
  const emptyDataTx = { ...exampleTx, data: [] };
  
  // Test with modified data array (lowercase content key)
  const lowercaseContentTx = { 
    ...exampleTx, 
    data: [
      "app=lockd.app",
      "content=lowercase content test",
      "is_locked=false"
    ] 
  };

  // Create mock data for the extract_lock_protocol_data method
  // This simulates the data that would be extracted from transaction outputs
  const mockData = [
    "app=lockd.app",
    "lock",
    "content=from output data"
  ];

  // Test cases
  const testCases = [
    {
      name: "Standard transaction with content in data array",
      tx: exampleTx,
      data: mockData,
      expectedContent: "Hell and back"
    },
    {
      name: "Transaction with empty data array",
      tx: emptyDataTx,
      data: mockData,
      expectedContent: "from output data" // Should fall back to data from outputs
    },
    {
      name: "Transaction with lowercase content key",
      tx: lowercaseContentTx,
      data: mockData,
      expectedContent: "lowercase content test"
    }
  ];

  // Run tests
  for (const test of testCases) {
    logger.info(`🧪 Testing: ${test.name}`);
    
    // Extract data from transaction
    const extractedData = parser.extract_lock_protocol_data(test.data, test.tx);
    
    if (extractedData) {
      logger.info('📊 Extracted data', { 
        content: extractedData.content,
        expected: test.expectedContent,
        match: extractedData.content === test.expectedContent ? '✅ MATCH' : '❌ MISMATCH'
      });
    } else {
      logger.error('❌ Failed to extract data from transaction');
    }
  }
}

testContentExtraction().catch(e => {
  logger.error(e);
  process.exit(1);
});
