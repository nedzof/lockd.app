import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';

async function checkDatabaseData() {
  const prisma = new PrismaClient();
  
  try {
    // Check processed transactions
    const transactionCount = await prisma.processed_transaction.count();
    const voteTransactions = await prisma.processed_transaction.count({
      where: { type: 'vote' }
    });
    
    logger.info('Processed Transactions Stats:', {
      total_transactions: transactionCount,
      vote_transactions: voteTransactions
    });

    // Get latest transactions
    const latestTransactions = await prisma.processed_transaction.findMany({
      take: 5,
      orderBy: { block_time: 'desc' },
      select: {
        tx_id: true,
        type: true,
        block_height: true,
        block_time: true
      }
    });

    logger.info('Latest Transactions:', {
      transactions: latestTransactions
    });

    // Check posts
    const postCount = await prisma.post.count();
    const votePosts = await prisma.post.count({
      where: { is_vote: true }
    });
    
    logger.info('Posts Stats:', {
      total_posts: postCount,
      vote_posts: votePosts
    });

    // Get latest posts
    const latestPosts = await prisma.post.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        vote_options: true
      }
    });

    logger.info('Latest Posts:', {
      posts: latestPosts.map(post => ({
        id: post.id,
        tx_id: post.tx_id,
        is_vote: post.is_vote,
        vote_options_count: post.vote_options.length,
        created_at: post.created_at
      }))
    });

    // Check vote options
    const voteOptionCount = await prisma.vote_option.count();
    
    logger.info('Vote Options Stats:', {
      total_vote_options: voteOptionCount
    });

    // Get latest vote options
    const latestVoteOptions = await prisma.vote_option.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        post: true
      }
    });

    logger.info('Latest Vote Options:', {
      options: latestVoteOptions.map(option => ({
        id: option.id,
        post_id: option.post_id,
        content: option.content,
        created_at: option.created_at
      }))
    });

  } catch (error) {
    logger.error('Error checking database data:', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkDatabaseData().catch(console.error); 