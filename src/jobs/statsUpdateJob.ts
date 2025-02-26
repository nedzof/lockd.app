import { CronJob } from 'cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Job to update statistics periodically
 */
export const initializeStatsUpdateJob = () => {
  // Run every hour at minute 0
  const job = new CronJob('0 * * * *', async () => {
    try {
      logger.info('Running stats update job');
      
      // Calculate statistics
      const [
        totalPosts,
        totalVotes,
        totalLockLikes,
        totalUsers,
        totalBsvLockedResult,
        avgLockDurationResult,
        mostUsedTag,
        mostActiveUser
      ] = await Promise.all([
        // Total posts
        prisma.post.count(),
        
        // Total votes
        prisma.post.count({
          where: {
            is_vote: true
          }
        }),
        
        // Total lock likes
        prisma.lockLike.count(),
        
        // Total unique users
        prisma.post.findMany({
          where: {
            author_address: {
              not: null
            }
          },
          select: {
            author_address: true
          },
          distinct: ['author_address']
        }).then(users => users.length),
        
        // Total BSV locked
        prisma.lockLike.aggregate({
          _sum: {
            amount: true
          }
        }),
        
        // Average lock duration
        prisma.lockLike.aggregate({
          _avg: {
            lock_duration: true
          }
        }),
        
        // Most used tag
        prisma.tag.findMany({
          orderBy: {
            usageCount: 'desc'
          },
          take: 1
        }),
        
        // Most active user
        prisma.post.groupBy({
          by: ['author_address'],
          where: {
            author_address: {
              not: null
            }
          },
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: 1
        })
      ]);
      
      // Create stats in the database
      await prisma.stats.create({
        data: {
          total_posts: totalPosts,
          total_votes: totalVotes,
          total_lock_likes: totalLockLikes,
          total_users: totalUsers,
          total_bsv_locked: totalBsvLockedResult._sum.amount || 0,
          avg_lock_duration: avgLockDurationResult._avg.lock_duration || 0,
          most_used_tag: mostUsedTag.length > 0 ? mostUsedTag[0].name : null,
          most_active_user: mostActiveUser.length > 0 ? mostActiveUser[0].author_address : null,
          last_updated: new Date()
        }
      });
      
      logger.info('Stats update job completed successfully');
    } catch (error) {
      logger.error('Error in stats update job', { error });
    }
  });
  
  // Start the job
  job.start();
  
  logger.info('Stats update job scheduled');
  
  return job;
};
