import { CronJob } from 'cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { fetchBsvPrice, checkIfColumnExists } from '../utils/bsvPrice';

const prisma = new PrismaClient();

/**
 * Job to update statistics periodically
 */
export const initializeStatsUpdateJob = () => {
  // Run every hour at minute 0
  const job = new CronJob('0 * * * *', async () => {
    try {
      logger.info('Running stats update job');
      
      // Check if the current_bsv_price column exists in the stats table
      const bsvPriceColumnExists = await checkIfColumnExists(prisma, 'stats', 'current_bsv_price');
      logger.info(`BSV price column exists: ${bsvPriceColumnExists}`);
      
      // Calculate statistics
      const [
        total_posts,
        total_votes,
        total_lock_likes,
        total_users,
        total_bsv_lockedResult,
        avg_lock_durationResult,
        most_used_tag,
        mostActiveUser,
        currentBsvPrice
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
        prisma.lock_like.count(),
        
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
        prisma.lock_like.aggregate({
          _sum: {
            amount: true
          }
        }),
        
        // Average lock duration
        prisma.lock_like.aggregate({
          _avg: {
            lock_duration: true
          }
        }),
        
        // Most used tag
        prisma.tag.findMany({
          orderBy: {
            usage_count: 'desc'
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
        }),
        
        // Current BSV price
        fetchBsvPrice()
      ]);
      
      // Create stats data object
      const statsData: any = {
        total_posts: total_posts,
        total_votes: total_votes,
        total_lock_likes: total_lock_likes,
        total_users: total_users,
        total_bsv_locked: total_bsv_lockedResult._sum.amount || 0,
        avg_lock_duration: avg_lock_durationResult._avg.lock_duration || 0,
        most_used_tag: most_used_tag.length > 0 ? most_used_tag[0].name : null,
        most_active_user: mostActiveUser.length > 0 ? mostActiveUser[0].author_address : null,
        last_updated: new Date()
      };
      
      // Only add the current_bsv_price field if the column exists
      if (bsvPriceColumnExists && currentBsvPrice !== null) {
        statsData.current_bsv_price = currentBsvPrice;
        logger.info(`Adding BSV price to stats: ${currentBsvPrice}`);
      }
      
      // Create stats in the database
      await prisma.stats.create({
        data: statsData
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
