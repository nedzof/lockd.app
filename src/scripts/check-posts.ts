/**
 * Script to check if posts and vote_options are being saved in the database
 * Enhanced to provide detailed diagnostic information about post creation issues
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

async function checkPosts() {
    const prisma = new PrismaClient({
        datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
        log: [
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' },
        ],
    });

    try {
        // Check database connection first
        logger.info('Checking database connection...');
        await prisma.$connect();
        logger.info('✅ Database connection successful');
        
        // Check transactions table first to see what we have
        logger.info('\n📊 Checking processed transactions in the database...');
        const txCount = await prisma.processed_transaction.count();
        logger.info(`Found ${txCount} processed transactions in the database`);
        
        // Check posts table
        logger.info('\n📝 Checking posts in the database...');
        const postCount = await prisma.post.count();
        logger.info(`Found ${postCount} posts in the database`);
        
        if (postCount > 0) {
            // Get recent posts with more details
            const recentPosts = await prisma.post.findMany({
                take: 5,
                orderBy: { created_at: 'desc' },
                include: { vote_options: true }
            });
            
            logger.info('Recent posts:', {
                count: recentPosts.length,
                posts: recentPosts.map(post => ({
                    id: post.id,
                    tx_id: post.tx_id,
                    content_length: post.content?.length || 0,
                    content_preview: post.content?.substring(0, 50) + (post.content?.length > 50 ? '...' : '') || 'NO CONTENT',
                    is_vote: post.is_vote,
                    created_at: post.created_at,
                    vote_options_count: post.vote_options?.length || 0,
                    block_height: post.block_height
                }))
            });
        } else {
            // If no posts found, check why - examine transactions of type 'post'
            logger.warn('⚠️ No posts found in the database, checking for post transactions...');
            const postTxs = await prisma.processed_transaction.findMany({
                where: { type: 'post' },
                take: 5,
                orderBy: { created_at: 'desc' }
            });
            
            if (postTxs.length > 0) {
                logger.info(`Found ${postTxs.length} transactions of type 'post', but they were not created as Post entities`);
                logger.info('Recent post transactions:', {
                    post_txs: postTxs.map(tx => ({
                        id: tx.id,
                        tx_id: tx.tx_id,
                        has_content: tx.content ? true : false,
                        content_length: tx.content?.length || 0,
                        content_preview: tx.content?.substring(0, 30) + (tx.content?.length > 30 ? '...' : '') || 'NO CONTENT',
                        created_at: tx.created_at,
                        author_address: tx.author_address,
                        block_height: tx.block_height
                    }))
                });
            } else {
                logger.warn('⚠️ No transactions of type post found!');
            }
        }
        
        // Check vote_options table
        logger.info('\n🗳️ Checking vote options in the database...');
        const voteOptionsCount = await prisma.vote_option.count();
        logger.info(`Found ${voteOptionsCount} vote options in the database`);
        
        if (voteOptionsCount > 0) {
            const recentVoteOptions = await prisma.vote_option.findMany({
                take: 5,
                orderBy: { created_at: 'desc' },
                include: { post: true }
            });
            
            logger.info('Recent vote options:', {
                count: recentVoteOptions.length,
                options: recentVoteOptions.map(option => ({
                    id: option.id,
                    option_text: option.option_text?.substring(0, 30) + (option.option_text?.length > 30 ? '...' : '') || 'NO TEXT',
                    post_id: option.post_id,
                    post_tx_id: option.post?.tx_id || 'MISSING',
                    vote_count: option.vote_count,
                    created_at: option.created_at
                }))
            });
        } else {
            // If no vote options found, check if any vote posts exist
            logger.warn('⚠️ No vote options found in the database, checking for vote posts...');
            const votePosts = await prisma.post.findMany({
                where: { is_vote: true },
                take: 5,
                orderBy: { created_at: 'desc' }
            });
            
            if (votePosts.length > 0) {
                logger.info(`Found ${votePosts.length} vote posts, but no vote options were created`);
                logger.info('Vote posts without options:', {
                    posts: votePosts.map(post => ({
                        id: post.id,
                        tx_id: post.tx_id,
                        created_at: post.created_at,
                        content_preview: post.content?.substring(0, 50) || 'NO CONTENT'
                    }))
                });
            } else {
                logger.warn('⚠️ No vote posts found either!');
            }
        }
        
        // Check transactions with block heights
        logger.info('\n🧱 Checking block heights in processed transactions...');
        const txWithBlockHeight = await prisma.processed_transaction.count({
            where: {
                block_height: { gt: 0 }
            }
        });
        // Count total transactions and calculate those without a proper block height
        const totalTxCount = await prisma.processed_transaction.count();
        const txWithoutBlockHeight = totalTxCount - txWithBlockHeight;
        
        logger.info(`Found ${txWithBlockHeight} transactions with valid block heights`);
        logger.info(`Found ${txWithoutBlockHeight} transactions without block heights`);
        
        // Get block height distribution
        if (txWithBlockHeight > 0) {
            const blockHeightStats = await prisma.processed_transaction.groupBy({
                by: ['block_height'],
                _count: { tx_id: true },
                orderBy: { block_height: 'desc' },
                where: { block_height: { gt: 0 } },
                take: 5
            });
            
            logger.info('Block height distribution:', {
                stats: blockHeightStats.map(stat => ({
                    block_height: stat.block_height,
                    tx_count: stat._count.tx_id
                }))
            });
            
            // Check posts with block heights
            const postsWithBlockHeight = await prisma.post.count({
                where: { block_height: { gt: 0 } }
            });
            logger.info(`Posts with valid block heights: ${postsWithBlockHeight} / ${postCount}`);
        }
        
        // Examine transaction types in the database
        logger.info('\n📋 Transaction type distribution:');
        const typeStats = await prisma.processed_transaction.groupBy({
            by: ['type'],
            _count: { tx_id: true }
        });
        
        typeStats.forEach(stat => {
            logger.info(`Type '${stat.type || 'NULL'}': ${stat._count.tx_id} transactions`);
        });
    } catch (error) {
        logger.error('Error checking database entities', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
    } finally {
        await prisma.$disconnect().catch(err => {
            logger.warn('Error disconnecting prisma client', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
        });
    }
}

// Run the check
checkPosts().catch(error => {
    console.error('Failed to run check-posts script:', error);
    process.exit(1);
});
