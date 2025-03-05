import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { VoteTransactionService } from '../services/vote-transaction-service.js';
import { TransactionDataParser } from '../parser/transaction_data_parser.js';
import fs from 'fs';
import path from 'path';

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

// Real vote transaction example from the JSON file
const realVoteTx = {
  "id": "5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d",
  "block_hash": "00000000000000000029c312d5a4587a28cdb0cb2e859a204385bc42aadfa3c6",
  "block_height": 886623,
  "block_time": 1741125612,
  "author_address": "1Jgp8NYXoYEn74pnuEC2uGMoJ2sc17Xttc",
  "data": [
    { key: "app", value: "lockd.app" },
    { key: "type", value: "post" },
    { key: "vote", value: "true" },
    { key: "question", value: "When CDU's Friedrich \"Bubatz?\" Merz finally learned what cannabis is, his first move was to…" },
    { key: "option", value: "Schedule emergency meeting with Snoop Dogg" },
    { key: "option", value: "Declare war on the Dutch Tulip Registry" },
    { key: "option", value: "Re-brand CDU as \"Completely Done Understanding\"" },
    { key: "option", value: "Mandate 7PM polka parties for youth outreach" }
  ]
};

/**
 * Load a transaction from a JSON file
 * 
 * @param filePath - Path to the JSON file
 * @returns The transaction object
 */
async function loadTransactionFromFile(filePath: string): Promise<any> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    logger.error('❌ Error loading transaction from file', {
      error: error instanceof Error ? error.message : String(error),
      filePath
    });
    return null;
  }
}

/**
 * Process a transaction using the VoteTransactionService
 * 
 * @param tx - The transaction object
 * @param voteService - The VoteTransactionService
 * @returns The result of processing the transaction
 */
async function processVoteTransaction(tx: any, voteService: VoteTransactionService) {
  try {
    logger.info('🔍 Processing transaction', { tx_id: tx.id });
    
    // Process the transaction
    const result = await voteService.processVoteTransaction(tx);
    
    if (result) {
      logger.info('✅ Transaction processed successfully', { 
        post_id: result.post.id,
        options_count: result.voteOptions.length,
        question: result.post.content
      });
      
      // Log the vote options
      result.voteOptions.forEach((option, index) => {
        logger.info(`Option ${index + 1}:`, {
          content: option.content,
          tx_id: option.tx_id
        });
      });
      
      return {
        post_id: result.post.id,
        tx_id: tx.id,
        vote_question: result.post.content,
        vote_options: result.voteOptions.map(o => o.content),
        total_options: result.voteOptions.length
      };
    } else {
      logger.warn('⚠️ Transaction processing failed or was skipped', { tx_id: tx.id });
      return null;
    }
  } catch (error) {
    logger.error('❌ Error processing vote transaction', {
      error: error instanceof Error ? error.message : String(error),
      tx_id: tx?.id || 'unknown'
    });
    return null;
  }
}

/**
 * Main function to run the script
 */
async function main() {
  const prisma = new PrismaClient();
  const voteService = new VoteTransactionService(prisma);
  const txDataParser = new TransactionDataParser();
  
  try {
    logger.info('🧪 Starting vote transaction processing');
    
    // Process the example transaction
    logger.info('📝 Processing example transaction');
    const exampleResult = await processVoteTransaction(exampleTx, voteService);
    
    // Process the real vote transaction
    logger.info('📝 Processing real vote transaction');
    const realResult = await processVoteTransaction(realVoteTx, voteService);
    
    // Try to load and process a transaction from a file
    const filePath = path.resolve(process.cwd(), 'src/parser/5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d.json');
    logger.info('📝 Loading transaction from file', { filePath });
    
    const fileTransaction = await loadTransactionFromFile(filePath);
    if (fileTransaction) {
      logger.info('📝 Processing transaction from file', { tx_id: fileTransaction.id });
      
      // Extract data from the transaction
      const data = txDataParser.extract_data_from_transaction(fileTransaction);
      
      if (data.length > 0) {
        // Add the data to the transaction
        fileTransaction.data = data;
        
        // Process the transaction
        const fileResult = await processVoteTransaction(fileTransaction, voteService);
        
        if (fileResult) {
          logger.info('✅ File transaction processed successfully', fileResult);
        }
      } else {
        logger.warn('⚠️ No data extracted from file transaction');
      }
    }
    
    // Get all vote posts
    const votePosts = await voteService.getAllVotePosts();
    logger.info(`Found ${votePosts.length} vote posts`);
    
    // Log summary
    logger.info('📊 Processing summary', {
      example_result: exampleResult ? 'success' : 'failed',
      real_result: realResult ? 'success' : 'failed',
      file_result: fileTransaction ? 'attempted' : 'skipped',
      total_vote_posts: votePosts.length
    });
    
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the main function
if (import.meta.url === import.meta.resolve('./insert-vote-transaction.ts')) {
  main().catch(e => {
    logger.error(e);
    process.exit(1);
  });
}

export { processVoteTransaction };
