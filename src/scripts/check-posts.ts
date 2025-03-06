/**
 * Script to check if posts and vote_options are being saved in the database
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
        // Check posts table
        logger.info('Checking posts in the database...');
        const postCount = await prisma.post.count();
        logger.info(`Found ${postCount} posts in the database`);
        
        if (postCount > 0) {
            // Get recent posts
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
                    title: post.title?.substring(0, 30) + (post.title?.length > 30 ? '...' : ''),
                    created_at: post.created_at,
                    vote_options_count: post.vote_options?.length || 0
                }))
            });
        }
        
        // Check vote_options table
        logger.info('Checking vote options in the database...');
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
                    text: option.text?.substring(0, 30) + (option.text?.length > 30 ? '...' : ''),
                    post_id: option.post_id,
                    vote_count: option.vote_count,
                    created_at: option.created_at
                }))
            });
        }
        
        // Check transactions with block heights
        logger.info('Checking block heights in processed transactions...');
        const txWithBlockHeight = await prisma.processed_transaction.count({
            where: {
                block_height: { gt: 0 }
            }
        });
        logger.info(`Found ${txWithBlockHeight} transactions with valid block heights`);
        
        const blockHeightStats = await prisma.processed_transaction.groupBy({
            by: ['block_height'],
            _count: { tx_id: true },
            orderBy: { block_height: 'desc' },
            take: 5
        });
        
        logger.info('Block height distribution:', {
            stats: blockHeightStats.map(stat => ({
                block_height: stat.block_height,
                tx_count: stat._count.tx_id
            }))
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
