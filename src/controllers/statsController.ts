import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import axios from 'axios';
import { fetchBsvPrice } from '../utils/bsvPrice';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Export the router for the app to use
const router = express.Router();

// Helper function to get date range based on timeRange parameter
const getDateRange = (timeRange: string) => {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // Set to end of day to include today's data
  
  switch (timeRange) {
    case 'day':
      const oneDayAgo = new Date(now);
      oneDayAgo.setDate(now.getDate() - 1);
      oneDayAgo.setHours(0, 0, 0, 0); // Set to start of day
      return oneDayAgo;
    
    case 'week':
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      oneWeekAgo.setHours(0, 0, 0, 0); // Set to start of day
      return oneWeekAgo;
    
    case 'month':
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(now.getMonth() - 1);
      oneMonthAgo.setHours(0, 0, 0, 0); // Set to start of day
      return oneMonthAgo;
    
    default:
      // For 'all' or any other value, return a date far in the past
      const farPast = new Date(0);
      return farPast;
  }
};

/**
 * Get platform statistics
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || 'all';
    logger.info(`Fetching stats with timeRange: ${timeRange}`);
    
    // Get the latest stats record
    const stats = await prisma.stats.findFirst({
      orderBy: {
        last_updated: 'desc'
      }
    });

    if (!stats) {
      logger.warn('No statistics found, returning sample data');
      
      // Create sample data
      const sampleData = {
        id: 'sample-stats',
        total_posts: 125,
        total_votes: 350,
        total_lock_likes: 280,
        total_users: 75,
        total_bsv_locked: 1250.5,
        avg_lock_duration: 30,
        most_used_tag: 'bitcoin',
        mostActiveUser: '1PkQ63EaZ1SJibu1fVHQULZVsU99LoKJh1',
        currentBsvPrice: 45.75,
        lastUpdated: new Date()
      };
      
      // Create sample data for charts
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      
      // Generate sample lock time data
      const lockTimeData = months.map((month, index) => ({
        name: month,
        locks: 40 + Math.floor(Math.random() * 70)
      }));
      
      // Generate sample BSV locked over time data
      const bsvLockedOverTime = months.map((month, index) => ({
        name: month,
        bsv: 200 + Math.floor(Math.random() * 450)
      }));
      
      // Generate sample post distribution data
      const postDistributionData = [
        { range: '0-10 BSV', value: 45 },
        { range: '10-50 BSV', value: 30 },
        { range: '50-100 BSV', value: 15 },
        { range: '100+ BSV', value: 10 }
      ];
      
      // Generate sample tag usage data
      const tagUsageData = [
        { name: 'bitcoin', count: 65 },
        { name: 'bsv', count: 50 },
        { name: 'crypto', count: 35 },
        { name: 'blockchain', count: 30 },
        { name: 'nft', count: 25 }
      ];
      
      // Generate sample user activity data
      const userActivityData = [
        { name: 'Posts', users: 45 },
        { name: 'Votes', users: 78 },
        { name: 'Locks', users: 35 },
        { name: 'Comments', users: 60 }
      ];
      
      // Generate sample price data
      const priceData = months.map((month, index) => ({
        name: month,
        price: 40 + Math.floor(Math.random() * 15)
      }));
      
      // Return sample data
      return res.json({
        ...sampleData,
        lockTimeData,
        bsvLockedOverTime,
        postDistributionData,
        tagUsageData,
        userActivityData,
        priceData
      });
    }
    
    try {
      // Get date range for filtering
      const startDate = getDateRange(timeRange);
      
      // Replace raw SQL queries with Prisma queries
      const lockTimeData = await getLockTimeDataPrisma(timeRange);
      const bsvLockedOverTime = await getBsvLockedOverTimePrisma(timeRange);
      
      // Get post distribution data
      const postDistributionData = [
        {
          range: '0-10 BSV',
          value: await prisma.lock_like.count({
            where: {
              amount: {
                lte: 10
              },
              created_at: {
                gte: startDate
              }
            }
          })
        },
        {
          range: '10-50 BSV',
          value: await prisma.lock_like.count({
            where: {
              amount: {
                gt: 10,
                lte: 50
              },
              created_at: {
                gte: startDate
              }
            }
          })
        },
        {
          range: '50-100 BSV',
          value: await prisma.lock_like.count({
            where: {
              amount: {
                gt: 50,
                lte: 100
              },
              created_at: {
                gte: startDate
              }
            }
          })
        },
        {
          range: '100+ BSV',
          value: await prisma.lock_like.count({
            where: {
              amount: {
                gt: 100
              },
              created_at: {
                gte: startDate
              }
            }
          })
        }
      ];
      
      // Get tag usage data
      const tagUsageData = await prisma.tag.findMany({
        select: {
          name: true,
          usage_count: true
        },
        orderBy: {
          usage_count: 'desc'
        },
        take: 5
      }).then(tags => tags.map(tag => ({
        name: tag.name,
        count: tag.usage_count
      })));
      
      // Get user activity data
      const userActivityData = [
        {
          name: 'Posts',
          users: await prisma.post.groupBy({
            by: ['author_address'],
            where: {
              author_address: {
                not: null
              },
              created_at: {
                gte: startDate
              }
            }
          }).then(result => result.length)
        },
        {
          name: 'Votes',
          users: await prisma.post.groupBy({
            by: ['author_address'],
            where: {
              is_vote: true,
              author_address: {
                not: null
              },
              created_at: {
                gte: startDate
              }
            }
          }).then(result => result.length)
        },
        {
          name: 'Lock Likes',
          users: await prisma.lock_like.groupBy({
            by: ['author_address'],
            where: {
              author_address: {
                not: null
              },
              created_at: {
                gte: startDate
              }
            }
          }).then((result: any[]) => result.length)
        }
      ];
      
      // Get historical price data from the price history file if it exists
      let priceData = [];
      const cacheDir = path.join(__dirname, '../../data');
      const cacheFile = path.join(cacheDir, 'bsv_price_history.json');
      
      if (fs.existsSync(cacheFile)) {
        try {
          const priceHistory = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
          
          // Filter the price history based on the timeRange
          let filteredPriceHistory = [...priceHistory];
          const startDate = getDateRange(timeRange);
          
          filteredPriceHistory = filteredPriceHistory.filter(item => 
            new Date(item.date) >= startDate
          );
          
          // Format the data for the chart
          priceData = filteredPriceHistory.map(item => ({
            name: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            price: item.price
          }));
          
          logger.info(`Loaded ${priceData.length} price data points from cache`);
        } catch (error) {
          logger.error('Error reading price history from cache', { error });
          // Fall back to sample data
          priceData = generateSamplePriceData(stats);
        }
      } else {
        // If no cache file exists, generate sample data
        priceData = generateSamplePriceData(stats);
      }
      
      // If we couldn't get price data or it's empty, generate sample data
      if (!priceData || priceData.length === 0) {
        priceData = generateSamplePriceData(stats);
      }
      
      // Return the data with the current_bsv_price field if it exists
      const statsData = { ...stats };
      
      // If current_bsv_price doesn't exist in the stats object, add it with a default value
      if (statsData.current_bsv_price === undefined || statsData.current_bsv_price === null) {
        // Try to fetch the current price
        try {
          const currentPrice = await fetchBsvPrice();
          if (currentPrice !== null) {
            statsData.current_bsv_price = currentPrice;
          } else {
            statsData.current_bsv_price = priceData.length > 0 ? 
              priceData[priceData.length - 1].price : 45.0;
          }
        } catch (error) {
          logger.error('Error fetching current BSV price', { error });
          statsData.current_bsv_price = priceData.length > 0 ? 
            priceData[priceData.length - 1].price : 45.0;
        }
      }
      
      // Include current BSV price if available
      if (stats && stats.current_bsv_price) {
        statsData.current_bsv_price = stats.current_bsv_price;
      }
      
      // Get lock size distribution data
      const lockSizeDistribution = await getLockSizeDistribution();
      
      return res.json({
        ...statsData,
        lockTimeData,
        bsvLockedOverTime,
        postDistributionData,
        tagUsageData,
        userActivityData,
        priceData,
        lockSizeDistribution
      });
    } catch (innerError) {
      logger.error('Error processing stats data', { error: innerError });
      
      // If there's an error in processing the data, return just the basic stats
      return res.json({
        ...stats,
        lockTimeData: [],
        bsvLockedOverTime: [],
        postDistributionData: [],
        tagUsageData: [],
        userActivityData: [],
        priceData: []
      });
    }
  } catch (error) {
    logger.error('Error fetching stats', { error });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

/**
 * Update statistics in the database
 * This should be called periodically to refresh the stats
 */
export const updateStats = async (req: Request, res: Response) => {
  try {
    logger.info('Starting stats update process');

    // First, get the current block height to determine which locks are still active
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    });
    
    const current_block_height = latestBlock?.block_height || 0;
    logger.info(`Current block height for stats calculation: ${current_block_height}`);

    // Calculate statistics from real data
    const [
      total_posts,
      total_votes,
      total_lock_likes,
      total_users,
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
      prisma.lock_like.count({
        where: {
          amount: {
            gt: 0  // Only count locks with amount greater than 0
          }
        }
      }),
      
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
    
    // Calculate total BSV locked with only active locks (considering block height)
    const active_locks = await prisma.lock_like.findMany({
      where: {
        amount: {
          gt: 0  // Only consider locks with amount greater than 0
        },
        AND: [
          {
            // Only include locks with a defined unlock height
            unlock_height: {
              not: null
            }
          },
          {
            // Only include locks where the current block height has not yet reached the unlock height
            unlock_height: {
              gt: current_block_height
            }
          }
        ]
      },
      select: {
        id: true,
        tx_id: true,
        amount: true,
        unlock_height: true
      }
    });
    
    // Log each active lock for debugging
    logger.info(`Found ${active_locks.length} active locks with details:`);
    active_locks.forEach((lock, index) => {
      if (index < 10) { // Only log the first 10 for brevity
        logger.info(`Active lock #${index+1}: ID=${lock.id}, TX=${lock.tx_id}, Amount=${lock.amount}, Unlock Height=${lock.unlock_height || 'permanent'}, Current Height=${current_block_height}`);
      }
    });
    
    // Calculate the total active locked amount
    const total_bsv_locked = active_locks.reduce((sum, lock) => sum + Number(lock.amount), 0);
    
    // Calculate average lock duration for active locks only
    const active_locks_with_unlock = active_locks.filter(lock => lock.unlock_height !== null);
    const avg_lock_duration = active_locks_with_unlock.length > 0
      ? active_locks_with_unlock.reduce((sum, lock) => sum + Number(lock.unlock_height || 0) - current_block_height, 0) / active_locks_with_unlock.length
      : 0;
    
    // Log detailed statistics
    logger.info(`Stats update results: 
      - Total posts: ${total_posts}
      - Total votes: ${total_votes}
      - Total lock likes: ${total_lock_likes}
      - Total users: ${total_users}
      - Active locks count: ${active_locks.length}
      - Total active BSV locked: ${total_bsv_locked}
      - Average blocks until unlock: ${Math.round(avg_lock_duration)}
      - Current block height: ${current_block_height}
    `);
    
    // Additional debugging for lock amounts
    try {
      // Count locks with zero amount
      const zeroAmountLocks = await prisma.lock_like.count({
        where: {
          amount: 0
        }
      });
      
      // Count unlockable locks (those that have reached their unlock height)
      const unlockable_locks = await prisma.lock_like.count({
        where: {
          amount: { gt: 0 },
          unlock_height: { lte: current_block_height, not: null }
        }
      });
      
      // Get total locks
      const totalLocks = await prisma.lock_like.count();
      
      // Get total amount of unlockable funds
      const unlockable_amount_result = await prisma.lock_like.aggregate({
        _sum: {
          amount: true
        },
        where: {
          amount: { gt: 0 },
          unlock_height: { lte: current_block_height, not: null }
        }
      });
      
      const unlockable_amount = Number(unlockable_amount_result._sum?.amount || 0);
      
      logger.info(`Lock amount distribution:
        - Total locks: ${totalLocks}
        - Locks with zero amount: ${zeroAmountLocks}
        - Unlockable locks: ${unlockable_locks}
        - Unlockable amount: ${unlockable_amount}
        - Active locks: ${active_locks.length}
        - Active locked amount: ${total_bsv_locked}
      `);
    } catch (error) {
      logger.error('Error getting lock amount distribution', error);
    }
    
    // Check for unlockable funds for debugging purposes
    const unlockableFundsInfo = await checkUnlockableFunds();
    logger.info(`Unlockable funds summary: ${unlockableFundsInfo.count} locks with ${unlockableFundsInfo.totalAmount} BSV can be unlocked`);
    
    // Create stats data object with real data
    const statsData: any = {
      id: 'current-stats',
      total_posts,
      total_votes,
      total_lock_likes,
      total_users,
      total_bsv_locked: Number(total_bsv_locked),
      avg_lock_duration: Number(avg_lock_duration),
      most_used_tag: most_used_tag.length > 0 ? most_used_tag[0].name : null,
      most_active_user: mostActiveUser.length > 0 ? mostActiveUser[0].author_address : null,
      current_bsv_price: Number(currentBsvPrice || 0),
      last_updated: new Date()
    };
    
    // Create or update the stats record
    const stats = await prisma.stats.upsert({
      where: {
        id: 'current-stats'
      },
      update: statsData,
      create: statsData
    });
    
    // Get lock time data for chart
    const lockTimeData = await getLockTimeDataPrisma('all');
    
    // Get BSV locked over time data for chart
    const bsvLockedOverTime = await getBsvLockedOverTimePrisma('all');
    
    // Get lock size distribution data
    const lockSizeDistribution = await getLockSizeDistribution();
    
    logger.info('Stats update completed successfully');
    
    return res.json({
      message: 'Statistics updated successfully',
      stats,
      lockTimeData,
      bsvLockedOverTime,
      lockSizeDistribution
    });
  } catch (error) {
    logger.error('Error updating statistics:', error);
    return res.status(500).json({ 
      error: 'Failed to update statistics', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
};

// Helper function to get lock time data using Prisma instead of raw SQL
async function getLockTimeDataPrisma(timeRange: string) {
  try {
    const startDate = getDateRange(timeRange);
    logger.info(`Getting lock time data for range ${timeRange}, startDate: ${startDate.toISOString()}`);
    
    // First, get the current block height
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    });
    
    const current_block_height = latestBlock?.block_height || 0;
    logger.info(`Current block height for lock time chart: ${current_block_height}`);
    
    // Get ALL lock_like entries within the time range, regardless of their unlock status
    // This ensures we always have data to display
    const locks = await prisma.lock_like.findMany({
      where: {
        created_at: {
          gte: startDate
        },
        amount: {
          gt: 0 // Only include locks with positive amounts
        }
      },
      select: {
        id: true,
        tx_id: true, 
        created_at: true,
        unlock_height: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });
    
    logger.info(`Found ${locks.length} locks for time range ${timeRange}`);
    
    // Calculate active locks (those that are still locked)
    const activeLocks = locks.filter(lock => 
      lock.unlock_height !== null && 
      lock.unlock_height > current_block_height
    );
    
    logger.info(`Of those, ${activeLocks.length} are still active (non-null unlock_height and unlock_height > current_block_height)`);
    
    // Log a few examples
    locks.slice(0, 5).forEach((lock, i) => {
      const isActive = lock.unlock_height !== null && lock.unlock_height > current_block_height;
      logger.info(`Lock ${i+1}: ID=${lock.id}, TX=${lock.tx_id}, Created=${lock.created_at}, Unlock=${lock.unlock_height || 'null'}, Active=${isActive}`);
    });
    
    // Group the locks by the appropriate time period
    const grouped = groupByTimePeriod(locks, timeRange);
    
    // Format the data to include both total and active counts for each time period
    const formattedData = Object.entries(grouped).map(([name, periodLocks]) => {
      const activePeriodLocks = periodLocks.filter(lock => 
        lock.unlock_height !== null && 
        lock.unlock_height > current_block_height
      );
      
      return {
        name,
        locks: periodLocks.length, // Total locks
        active_locks: activePeriodLocks.length // Active locks only
      };
    });
    
    logger.info(`Formatted lock time data: ${JSON.stringify(formattedData)}`);
    return formattedData;
  } catch (error) {
    logger.error('Error getting lock time data with Prisma', error);
    return [];
  }
}

// Helper function to get BSV locked over time data using Prisma instead of raw SQL
async function getBsvLockedOverTimePrisma(timeRange: string) {
  try {
    const startDate = getDateRange(timeRange);
    logger.info(`Getting BSV locked data for range ${timeRange}, startDate: ${startDate.toISOString()}`);
    
    // First, get the current block height
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    });
    
    const current_block_height = latestBlock?.block_height || 0;
    logger.info(`Current block height for BSV locked chart: ${current_block_height}`);
    
    // Get ALL lock_like entries within the time range, regardless of their unlock status
    // This ensures we always have data to display
    const locks = await prisma.lock_like.findMany({
      where: {
        created_at: {
          gte: startDate
        },
        amount: {
          gt: 0 // Only include locks with positive amounts
        }
      },
      select: {
        id: true,
        tx_id: true,
        created_at: true,
        amount: true,
        unlock_height: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });
    
    // Log the first few locks for debugging
    logger.info(`Found ${locks.length} locks with amounts for time range ${timeRange}`);
    
    // Calculate active locks (those that are still locked)
    const activeLocks = locks.filter(lock => 
      lock.unlock_height !== null && 
      lock.unlock_height > current_block_height
    );
    
    logger.info(`Of those, ${activeLocks.length} are still active (non-null unlock_height and unlock_height > current_block_height)`);
    
    locks.slice(0, 5).forEach((lock, i) => {
      const isActive = lock.unlock_height !== null && lock.unlock_height > current_block_height;
      logger.info(`Lock ${i+1}: ID=${lock.id}, TX=${lock.tx_id}, Amount=${lock.amount}, Created=${lock.created_at}, Unlock=${lock.unlock_height || 'null'}, Active=${isActive}`);
    });
    
    // Group the locks by the appropriate time period
    const grouped = groupByTimePeriod(locks, timeRange);
    
    // Calculate the sum of amounts for each time period (both total and active)
    const formattedData = Object.entries(grouped).map(([name, periodLocks]) => {
      const totalAmount = periodLocks.reduce((sum, lock) => sum + Number(lock.amount || 0), 0);
      
      const activePeriodLocks = periodLocks.filter(lock => 
        lock.unlock_height !== null && 
        lock.unlock_height > current_block_height
      );
      
      const activeAmount = activePeriodLocks.reduce((sum, lock) => sum + Number(lock.amount || 0), 0);
      
      return {
        name,
        bsv: activeAmount, // Use active amount for the main chart
        total_bsv: totalAmount // Include total amount for reference
      };
    });
    
    logger.info(`Formatted BSV locked data: ${JSON.stringify(formattedData)}`);
    return formattedData;
  } catch (error) {
    logger.error('Error getting BSV locked over time data with Prisma', error);
    return [];
  }
}

// Helper function to group data by time period
function groupByTimePeriod(data: any[], timeRange: string) {
  const grouped: { [key: string]: any[] } = {};
  
  // Create a complete set of time slots for the selected range
  const timeSlots = generateTimeSlots(timeRange);
  
  // Initialize all time slots with empty arrays
  timeSlots.forEach(slot => {
    grouped[slot] = [];
  });
  
  // Now add actual data to the appropriate slots
  data.forEach(item => {
    const date = new Date(item.created_at);
    let key = formatDateForTimeRange(date, timeRange);
    
    if (grouped[key]) {
      grouped[key].push(item);
    } else {
      // In case there's any key not in our predefined slots
      grouped[key] = [item];
    }
  });
  
  return grouped;
}

// Helper function to generate time slots for chart
function generateTimeSlots(timeRange: string): string[] {
  const slots: string[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  
  switch (timeRange) {
    case 'day': {
      // For 24h view, generate 24 hourly slots
      const startOfDay = new Date(now);
      startOfDay.setDate(now.getDate() - 1);
      startOfDay.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 24; i++) {
        const hourSlot = new Date(startOfDay);
        hourSlot.setHours(hourSlot.getHours() + i);
        slots.push(formatDateForTimeRange(hourSlot, 'day'));
      }
      break;
    }
    
    case 'week': {
      // For week view, generate 7 daily slots
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      
      for (let i = 0; i <= 7; i++) {
        const daySlot = new Date(startDate);
        daySlot.setDate(daySlot.getDate() + i);
        slots.push(formatDateForTimeRange(daySlot, 'week'));
      }
      break;
    }
    
    case 'month': {
      // For month view, generate daily slots for the past month
      const startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
      
      for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        slots.push(formatDateForTimeRange(new Date(d), 'month'));
      }
      break;
    }
    
    default: {
      // For all-time view, get all months from the first post to now
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      
      for (let m = new Date(sixMonthsAgo); m <= now; m.setMonth(m.getMonth() + 1)) {
        slots.push(formatDateForTimeRange(new Date(m), 'all'));
      }
      break;
    }
  }
  
  return slots;
}

// Helper function to format date based on time range
function formatDateForTimeRange(date: Date, timeRange: string): string {
  switch (timeRange) {
    case 'day':
      // Format: "1 AM", "2 PM", etc.
      return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    case 'week':
    case 'month':
      // Format: "Mar 19", etc.
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      // Format: "Mar", "Apr", etc.
      return date.toLocaleDateString('en-US', { month: 'short' });
  }
}

// Helper function to get lock time data (keeping for backward compatibility)
async function getLockTimeData(timeRange: string) {
  return getLockTimeDataPrisma(timeRange);
}

// Helper function to get BSV locked over time data (keeping for backward compatibility)
async function getBsvLockedOverTimeData(timeRange: string) {
  return getBsvLockedOverTimePrisma(timeRange);
}

// Helper function to generate sample price data
function generateSamplePriceData(stats: any) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  
  // Use the current_bsv_price if it exists, otherwise use a default value
  const currentPrice = (stats as any)?.current_bsv_price || 45.0;
  
  return months.map((month, index) => {
    // Generate a price that fluctuates around the current price
    const randomFactor = 0.8 + (Math.random() * 0.4); // Between 0.8 and 1.2
    return {
      name: month,
      price: Math.round((currentPrice * randomFactor) * 100) / 100
    };
  });
}

// Helper function to get lock size distribution using Prisma instead of raw SQL
async function getLockSizeDistribution() {
  try {
    // First, get the current block height
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    });
    
    const current_block_height = latestBlock?.block_height || 0;
    logger.info(`Current block height for lock size distribution: ${current_block_height}`);
    
    // Get ALL lock_like entries, regardless of their unlock status
    // This ensures we always have data to display
    const locks = await prisma.lock_like.findMany({
      where: {
        amount: {
          gt: 0 // Only include locks with positive amounts
        }
      },
      select: {
        amount: true,
        unlock_height: true
      }
    });
    
    logger.info(`Found ${locks.length} locks for size distribution`);
    
    // Filter active locks (those that are still locked)
    const activeLocks = locks.filter(lock => 
      lock.unlock_height !== null && 
      lock.unlock_height > current_block_height
    );
    
    logger.info(`Of those, ${activeLocks.length} are still active (non-null unlock_height and unlock_height > current_block_height)`);
    
    // Use all locks for distribution if there are no active locks
    // This ensures we always have data to display
    const locksToUse = activeLocks.length > 0 ? activeLocks : locks;
    
    // Convert all amounts to BSV
    const bsvAmounts = locksToUse.map(lock => 
      parseFloat(lock.amount.toString()) / 100000000
    );
    
    // If no locks exist, return empty data
    if (bsvAmounts.length === 0) {
      return {
        distribution: [],
        totalLockedAmount: 0
      };
    }
    
    // Sort the amounts to find min, max, and make distribution calculation
    const sortedAmounts = [...bsvAmounts].sort((a, b) => a - b);
    const minAmount = sortedAmounts[0];
    const maxAmount = sortedAmounts[sortedAmounts.length - 1];
    
    // If all amounts are the same, create just one bucket
    if (minAmount === maxAmount) {
      const distribution = [{
        name: `${minAmount.toFixed(8)} BSV`,
        count: bsvAmounts.length
      }];
      
      // Calculate the total locked amount (in satoshis)
      const totalLockedAmount = activeLocks.reduce((sum, lock) => 
        sum + parseFloat(lock.amount.toString()), 0
      );
      
      return {
        distribution,
        totalLockedAmount
      };
    }
    
    // Create 5 buckets based on data distribution
    const numBuckets = 5;
    const buckets: {[key: string]: number} = {};
    
    // Determine bucket boundaries using quantiles
    for (let i = 0; i < numBuckets; i++) {
      // Use percentiles to create even distribution
      const percentile = i / numBuckets;
      const nextPercentile = (i + 1) / numBuckets;
      
      const lowerIdx = Math.floor(percentile * sortedAmounts.length);
      const upperIdx = Math.floor(nextPercentile * sortedAmounts.length) - 1;
      
      const lowerValue = sortedAmounts[lowerIdx];
      let upperValue = i === numBuckets - 1 ? 
        sortedAmounts[sortedAmounts.length - 1] : 
        sortedAmounts[upperIdx];
      
      // Format bucket name based on range
      let bucketName: string;
      
      if (i === numBuckets - 1) {
        // For the last bucket, use a "+" format
        bucketName = `${lowerValue.toFixed(lowerValue < 0.01 ? 6 : 4)}+ BSV`;
      } else {
        // For other buckets, use a range format
        bucketName = `${lowerValue.toFixed(lowerValue < 0.01 ? 6 : 4)}-${upperValue.toFixed(upperValue < 0.01 ? 6 : 4)} BSV`;
      }
      
      buckets[bucketName] = 0;
    }
    
    // Now assign locks to buckets
    bsvAmounts.forEach((amount, index) => {
      // Find the right bucket for this amount
      for (const bucketName of Object.keys(buckets)) {
        // Special case for the last bucket with '+'
        if (bucketName.includes('+')) {
          const lowerBound = parseFloat(bucketName.split('-')[0].split(' ')[0]);
          if (amount >= lowerBound) {
            buckets[bucketName]++;
            break;
          }
        } else {
          // Handle normal range buckets
          const [lowerBoundStr, upperBoundStr] = bucketName.split('-');
          const lowerBound = parseFloat(lowerBoundStr);
          const upperBound = parseFloat(upperBoundStr.split(' ')[0]);
          
          if (amount >= lowerBound && amount <= upperBound) {
            buckets[bucketName]++;
            break;
          }
        }
      }
    });
    
    // Format the data for the chart
    const formattedData = Object.entries(buckets).map(([range, count]) => ({
      name: range,
      count
    }));
    
    // Calculate the sum of amounts for active locks (in satoshis)
    const totalLockedAmount = activeLocks.reduce((sum, lock) => 
      sum + parseFloat(lock.amount.toString()), 0
    );
    
    logger.info(`Formatted lock size distribution: ${JSON.stringify(formattedData)}`);
    logger.info(`Total locked amount: ${totalLockedAmount}`);
    
    // Add the total locked amount to the formatted data for display
    return {
      distribution: formattedData,
      totalLockedAmount: totalLockedAmount
    };
  } catch (error) {
    logger.error('Error getting lock size distribution with Prisma', error);
    return {
      distribution: [],
      totalLockedAmount: 0
    };
  }
}

// Utility function to check for unlockable funds
async function checkUnlockableFunds() {
  try {
    // Get the current block height
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    });
    
    const current_block_height = latestBlock?.block_height || 0;
    
    // Find locks that should be unlockable (current height >= unlock height)
    const unlockableLocks = await prisma.lock_like.findMany({
      where: {
        amount: {
          gt: 0
        },
        unlock_height: {
          not: null,
          lte: current_block_height
        }
      },
      select: {
        id: true,
        tx_id: true,
        amount: true,
        unlock_height: true,
        created_at: true
      }
    });
    
    const totalUnlockableAmount = unlockableLocks.reduce((sum, lock) => 
      sum + parseFloat(lock.amount.toString()), 0);
      
    logger.info(`Found ${unlockableLocks.length} unlockable locks with total amount ${totalUnlockableAmount} BSV`);
    
    // Log the first few unlockable locks
    unlockableLocks.slice(0, 10).forEach((lock, i) => {
      logger.info(`Unlockable lock ${i+1}: ID=${lock.id}, TX=${lock.tx_id}, Amount=${lock.amount}, Created=${lock.created_at}, Unlock Height=${lock.unlock_height}, Current Height=${current_block_height}`);
    });
    
    return {
      count: unlockableLocks.length,
      totalAmount: totalUnlockableAmount,
      locks: unlockableLocks.slice(0, 10) // Return first 10 for details
    };
  } catch (error) {
    logger.error('Error checking unlockable funds', error);
    return {
      count: 0,
      totalAmount: 0,
      locks: []
    };
  }
}

// API endpoints
router.get('/', async (req: Request, res: Response) => {
  // Pass the request to the existing exported getStats function
  return getStats(req, res);
});

router.get('/refresh', async (req: Request, res: Response) => {
  // Pass the request to the existing updateStats function
  return updateStats(req, res);
});

router.get('/bsv-locked', async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '1w';
    const data = await getBsvLockedOverTimePrisma(timeRange);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error getting BSV locked over time:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting BSV locked over time'
    });
  }
});

router.get('/lock-time', async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '1w';
    const data = await getLockTimeDataPrisma(timeRange);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error getting lock time data:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lock time data'
    });
  }
});

router.get('/lock-size', async (req: Request, res: Response) => {
  try {
    const data = await getLockSizeDistribution();
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error getting lock size distribution data:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lock size distribution data'
    });
  }
});

// API endpoint to check for unlockable funds
router.get('/check-unlockable', async (req: Request, res: Response) => {
  try {
    const unlockableFundsInfo = await checkUnlockableFunds();
    res.status(200).json({
      success: true,
      data: unlockableFundsInfo
    });
  } catch (error) {
    logger.error('Error checking unlockable funds:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking unlockable funds'
    });
  }
});

export default router;
