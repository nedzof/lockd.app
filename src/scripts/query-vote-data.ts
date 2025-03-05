import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Query and display vote data from the database
 */
async function queryVoteData() {
  const prisma = new PrismaClient();
  
  try {
    logger.info('🔍 Querying vote posts from the database');
    
    // Find all vote posts
    const votePosts = await prisma.post.findMany({
      where: {
        is_vote: true
      },
      include: {
        vote_options: {
          orderBy: {
            option_index: 'asc'
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 10 // Limit to 10 most recent
    });
    
    logger.info(`Found ${votePosts.length} vote posts`);
    
    // Display each vote post
    for (const post of votePosts) {
      logger.info('📊 Vote Post', {
        id: post.id,
        tx_id: post.tx_id,
        question: post.content,
        created_at: post.created_at,
        is_locked: post.is_locked,
        options_count: post.vote_options.length
      });
      
      // Display each option
      post.vote_options.forEach((option, index) => {
        logger.info(`📌 Option ${index + 1}`, {
          id: option.id,
          content: option.content,
          option_index: option.option_index
        });
      });
      
      // Get vote counts for each option
      const voteCounts = await Promise.all(
        post.vote_options.map(async (option) => {
          const count = await prisma.lock_like.count({
            where: {
              vote_option_id: option.id
            }
          });
          
          return {
            option_id: option.id,
            option_content: option.content,
            vote_count: count
          };
        })
      );
      
      logger.info('📈 Vote Counts', { voteCounts });
      
      // Calculate total votes
      const totalVotes = voteCounts.reduce((sum, item) => sum + item.vote_count, 0);
      
      logger.info('📊 Total Votes', { total: totalVotes });
      
      // Calculate percentages
      if (totalVotes > 0) {
        const votePercentages = voteCounts.map(item => ({
          option_content: item.option_content,
          vote_count: item.vote_count,
          percentage: Math.round((item.vote_count / totalVotes) * 100)
        }));
        
        logger.info('📊 Vote Percentages', { votePercentages });
      }
      
      logger.info('-----------------------------------');
    }
    
    // Find a specific vote post by tx_id
    const txId = '8ee0654e57143665976bb24b4c443c4e8a781aa32b2182cb2d23205e4d97c50e';
    logger.info(`🔍 Looking for specific vote post with tx_id: ${txId}`);
    
    const specificPost = await prisma.post.findUnique({
      where: {
        tx_id: txId
      },
      include: {
        vote_options: {
          orderBy: {
            option_index: 'asc'
          }
        }
      }
    });
    
    if (specificPost) {
      logger.info('📊 Found Specific Vote Post', {
        id: specificPost.id,
        tx_id: specificPost.tx_id,
        question: specificPost.content,
        created_at: specificPost.created_at,
        is_locked: specificPost.is_locked,
        options_count: specificPost.vote_options.length
      });
      
      // Display each option
      specificPost.vote_options.forEach((option, index) => {
        logger.info(`📌 Option ${index + 1}`, {
          id: option.id,
          content: option.content,
          option_index: option.option_index
        });
      });
    } else {
      logger.warn(`Vote post with tx_id ${txId} not found`);
    }
    
  } catch (error) {
    logger.error('❌ Error querying vote data', {
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
    await queryVoteData();
  } catch (error) {
    logger.error('❌ Error in main function', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === import.meta.resolve('./query-vote-data.ts')) {
  main().catch(e => {
    logger.error(e);
    process.exit(1);
  });
}

export { queryVoteData };
