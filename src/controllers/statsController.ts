import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import axios from 'axios';
import { fetchBsvPrice } from '../utils/bsvPrice';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Helper function to get date range based on timeRange parameter
const getDateRange = (timeRange: string) => {
  const now = new Date();
  
  switch (timeRange) {
    case 'day':
      const oneDayAgo = new Date(now);
      oneDayAgo.setDate(now.getDate() - 1);
      return oneDayAgo;
    
    case 'week':
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      return oneWeekAgo;
    
    case 'month':
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(now.getMonth() - 1);
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
      
      return res.json({
        ...statsData,
        lockTimeData,
        bsvLockedOverTime,
        postDistributionData,
        tagUsageData,
        userActivityData,
        priceData
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

    // Calculate statistics from real data
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
      
      // Total BSV locked
      prisma.lock_like.aggregate({
        _sum: {
          amount: true
        }
      }),
      
      // Average lock duration
      prisma.lock_like.aggregate({
        _avg: {
          unlock_height: true
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
    
    // Log results for debugging
    logger.info(`Stats update results: 
      - Total posts: ${total_posts}
      - Total votes: ${total_votes}
      - Total lock likes: ${total_lock_likes}
      - Total users: ${total_users}
      - Total BSV locked: ${total_bsv_lockedResult._sum?.amount || 0}
      - Avg unlock height: ${avg_lock_durationResult._avg?.unlock_height || 0}
    `);

    // Additional debugging for lock amounts
    try {
      // Count locks with zero amount
      const zeroAmountLocks = await prisma.lock_like.count({
        where: {
          amount: 0
        }
      });
      
      // Count locks with positive amount 
      const positiveAmountLocks = await prisma.lock_like.count({
        where: {
          amount: {
            gt: 0
          }
        }
      });
      
      // Get total locks
      const totalLocks = await prisma.lock_like.count();
      
      logger.info(`Lock amount distribution:
        - Total locks: ${totalLocks}
        - Locks with zero amount: ${zeroAmountLocks}
        - Locks with positive amount: ${positiveAmountLocks}
      `);
    } catch (error) {
      logger.error('Error getting lock amount distribution', error);
    }

    // Create stats data object with real data
    const statsData: any = {
      id: 'current-stats',
      total_posts,
      total_votes,
      total_lock_likes,
      total_users,
      total_bsv_locked: Number(total_bsv_lockedResult._sum?.amount || 0),
      avg_lock_duration: Number(avg_lock_durationResult._avg?.unlock_height || 0),
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
    
    logger.info('Stats update completed successfully');
    
    return res.json({
      message: 'Statistics updated successfully',
      stats,
      lockTimeData,
      bsvLockedOverTime
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
    
    // Get the appropriate time grouping based on the time range
    const timeGrouping = getTimeGroupingFormat(timeRange);
    
    // Get all lock_like entries within the time range
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
        created_at: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });
    
    // Group the locks by the appropriate time period
    const grouped = groupByTimePeriod(locks, timeRange);
    
    // Format the data for the chart
    return Object.entries(grouped).map(([name, locks]) => ({
      name,
      locks: locks.length
    }));
  } catch (error) {
    logger.error('Error getting lock time data with Prisma', error);
    return [];
  }
}

// Helper function to get BSV locked over time data using Prisma instead of raw SQL
async function getBsvLockedOverTimePrisma(timeRange: string) {
  try {
    const startDate = getDateRange(timeRange);
    
    // Get all lock_like entries within the time range
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
        created_at: true,
        amount: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });
    
    // Group the locks by the appropriate time period
    const grouped = groupByTimePeriod(locks, timeRange);
    
    // Calculate the sum of amounts for each time period
    return Object.entries(grouped).map(([name, locks]) => ({
      name,
      bsv: locks.reduce((sum, lock) => sum + Number(lock.amount || 0), 0)
    }));
  } catch (error) {
    logger.error('Error getting BSV locked over time data with Prisma', error);
    return [];
  }
}

// Helper function to get appropriate time format based on time range
function getTimeGroupingFormat(timeRange: string) {
  switch (timeRange) {
    case 'day':
      return 'hour'; // Group by hour for 24-hour view
    case 'week':
      return 'day'; // Group by day for week view
    case 'month':
      return 'day'; // Group by day for month view
    default:
      return 'month'; // Group by month for all-time view
  }
}

// Helper function to group data by time period
function groupByTimePeriod(data: any[], timeRange: string) {
  const grouped: { [key: string]: any[] } = {};
  
  data.forEach(item => {
    const date = new Date(item.created_at);
    let key = '';
    
    switch (timeRange) {
      case 'day':
        // Format: "1 AM", "2 PM", etc.
        key = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        break;
      case 'week':
      case 'month':
        // Format: "Jan 1", "Jan 2", etc.
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      default:
        // Format: "Jan", "Feb", etc.
        key = date.toLocaleDateString('en-US', { month: 'short' });
        break;
    }
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    
    grouped[key].push(item);
  });
  
  return grouped;
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
