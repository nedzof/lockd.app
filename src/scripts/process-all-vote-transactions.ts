import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { VoteTransactionService } from '../services/vote-transaction-service.js';
import { LockProtocolParser } from '../parser/lock_protocol_parser.js';
import { TransactionDataParser } from '../parser/transaction_data_parser.js';

/**
 * Process all existing transactions to identify and process votes
 */
async function processAllVoteTransactions() {
  const prisma = new PrismaClient();
  const voteService = new VoteTransactionService(prisma);
  const lockParser = new LockProtocolParser();
  const txDataParser = new TransactionDataParser();
  
  try {
    logger.info('🔍 Starting to process all transactions for votes');
    
    // Get all processed transactions
    const transactions = await prisma.processed_transaction.findMany({
      orderBy: {
        block_height: 'asc'
      }
    });
    
    logger.info(`Found ${transactions.length} transactions to check`);
    
    let votesFound = 0;
    let votesProcessed = 0;
    let alreadyProcessed = 0;
    let errors = 0;
    
    // Process each transaction
    for (const tx of transactions) {
      try {
        // Skip transactions that are already identified as votes
        if (tx.type === 'vote') {
          alreadyProcessed++;
          continue;
        }
        
        // Fetch the transaction data from JungleBus
        const txData = await txDataParser.fetch_transaction(tx.tx_id);
        
        if (!txData) {
          logger.warn(`Transaction data not found for ${tx.tx_id}`);
          continue;
        }
        
        // Extract data from the transaction
        const data = txDataParser.extract_data_from_transaction(txData);
        
        if (data.length === 0) {
          continue;
        }
        
        // Extract Lock protocol data
        const lockData = lockParser.extract_lock_protocol_data(data, txData);
        
        if (!lockData || !lockData.is_vote) {
          continue;
        }
        
        votesFound++;
        
        // Format the transaction for the vote service
        const voteTransaction = {
          id: tx.tx_id,
          block_hash: txData.block_hash,
          block_height: txData.block_height || Number(tx.block_height),
          block_time: txData.block_time || Number(tx.block_time),
          data: data,
          author_address: txData.author_address || tx.metadata?.author_address
        };
        
        logger.info(`🗳️ Found vote transaction: ${tx.tx_id}`, {
          question: lockData.vote_question,
          options: lockData.vote_options,
          total_options: lockData.total_options
        });
        
        // Check if this post already exists and is marked as a vote
        const existingPost = await prisma.post.findUnique({
          where: { tx_id: tx.tx_id },
          include: { vote_options: true }
        });
        
        if (existingPost && existingPost.is_vote && existingPost.vote_options.length > 0) {
          logger.info(`Post already processed as vote: ${tx.tx_id}`);
          alreadyProcessed++;
          continue;
        }
        
        // Process the vote transaction
        const result = await voteService.processVoteTransaction(voteTransaction);
        
        if (result) {
          votesProcessed++;
          logger.info(`✅ Successfully processed vote: ${tx.tx_id}`, {
            post_id: result.post.id,
            options_count: result.voteOptions.length
          });
          
          // Update the transaction type to 'vote'
          await prisma.processed_transaction.update({
            where: { tx_id: tx.tx_id },
            data: { type: 'vote' }
          });
        }
      } catch (error) {
        errors++;
        logger.error(`❌ Error processing transaction ${tx.tx_id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    logger.info('🎉 Finished processing all transactions', {
      total: transactions.length,
      votes_found: votesFound,
      votes_processed: votesProcessed,
      already_processed: alreadyProcessed,
      errors: errors
    });
    
  } catch (error) {
    logger.error('❌ Error in processAllVoteTransactions', {
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
    await processAllVoteTransactions();
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === import.meta.resolve('./process-all-vote-transactions.ts')) {
  main().catch(e => {
    logger.error(e);
    process.exit(1);
  });
}

export { processAllVoteTransactions };
