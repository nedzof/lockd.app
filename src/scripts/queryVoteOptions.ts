import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

async function queryVoteOptions() {
    const prisma = new PrismaClient();
    
    try {
        logger.info('Querying vote_option table');
        
        // Get count of vote options
        const count = await prisma.vote_option.count();
        logger.info(`Total vote options in database: ${count}`);
        
        // Get the most recent vote options
        const recentOptions = await prisma.vote_option.findMany({
            take: 10,
            orderBy: {
                created_at: 'desc'
            },
            include: {
                post: {
                    select: {
                        content: true,
                        is_vote: true
                    }
                }
            }
        });
        
        logger.info('Recent vote options:');
        recentOptions.forEach((option, index) => {
            logger.info(`Option ${index + 1}:`, {
                id: option.id,
                content: option.content,
                tx_id: option.tx_id,
                post_id: option.post_id,
                option_index: option.option_index,
                post_content: option.post.content,
                post_is_vote: option.post.is_vote
            });
        });
        
        // Group vote options by post_id
        const postGroups = await prisma.vote_option.groupBy({
            by: ['post_id'],
            _count: {
                id: true
            },
            orderBy: {
                _count: {
                    id: 'desc'
                }
            },
            take: 5
        });
        
        logger.info('Posts with most vote options:');
        for (const group of postGroups) {
            const post = await prisma.post.findUnique({
                where: { id: group.post_id },
                select: { content: true, is_vote: true }
            });
            
            logger.info(`Post ${group.post_id}:`, {
                option_count: group._count.id,
                post_content: post?.content,
                post_is_vote: post?.is_vote
            });
        }
        
        logger.info('Vote option query completed');
    } catch (error) {
        logger.error('Error querying vote options', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    } finally {
        await prisma.$disconnect();
    }
}

// Run the query
queryVoteOptions().catch(err => {
    logger.error('Unhandled error in query', {
        error: err instanceof Error ? err.message : 'Unknown error'
    });
});
