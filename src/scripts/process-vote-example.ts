import { PrismaClient } from '@prisma/client';
import { VoteTransactionService } from '../services/vote-transaction-service.js';
import { logger } from '../utils/logger.js';

// Example transaction data
const exampleVoteTransaction = {
  id: "5d0b4e8c8b3c5a9e7f1d2b4a3c6e9d2f1a4b7e9c2d5a8b3c6e9f2d5a8c1b4e7d",
  block_height: 800000,
  block_time: Math.floor(Date.now() / 1000),
  author_address: "1ABCDEFGhijklmnopqrstuvwxyz123456789",
  transaction: {
    inputs: [
      {
        address: "1ABCDEFGhijklmnopqrstuvwxyz123456789"
      }
    ],
    outputs: [
      {
        script: "OP_RETURN 6170706c6f636b6474797065706f7374766f746574727565"
      }
    ]
  },
  data: [
    {
      key: "app",
      value: "lockd"
    },
    {
      key: "type",
      value: "post"
    },
    {
      key: "vote",
      value: "true"
    },
    {
      key: "question",
      value: "What is your favorite programming language?"
    },
    {
      key: "option",
      value: "JavaScript"
    },
    {
      key: "option",
      value: "TypeScript"
    },
    {
      key: "option",
      value: "Python"
    },
    {
      key: "option",
      value: "Rust"
    },
    {
      key: "option",
      value: "Go"
    }
  ]
};

async function main() {
  try {
    logger.info('Starting vote processing example');
    
    const prisma = new PrismaClient();
    const voteService = new VoteTransactionService(prisma);
    
    logger.info('Processing example vote transaction');
    const result = await voteService.processVoteTransaction(exampleVoteTransaction);
    
    if (result) {
      logger.info('Vote processed successfully', {
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
    } else {
      logger.warn('Vote processing failed or was skipped');
    }
    
    // Get all vote posts
    const votePosts = await voteService.getAllVotePosts();
    logger.info(`Found ${votePosts.length} vote posts`);
    
    // Disconnect from the database
    await prisma.$disconnect();
    
    logger.info('Example completed');
  } catch (error) {
    logger.error('Error in example script', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// Run the main function
main().catch(error => {
  logger.error('Unhandled error in main', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
