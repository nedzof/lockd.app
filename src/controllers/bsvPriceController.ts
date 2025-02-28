import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { fetchBsvPrice } from '../utils/bsvPrice';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

/**
 * Get the current BSV price
 */
export const getBsvPrice = async (req: Request, res: Response) => {
  try {
    // First try to get the price from the database
    const latestStats = await prisma.stats.findFirst({
      orderBy: {
        lastUpdated: 'desc'
      }
    });
    
    // If we have a price in the database and it's less than 1 hour old, use it
    if (latestStats && latestStats.currentBsvPrice) {
      const priceAge = Date.now() - new Date(latestStats.lastUpdated).getTime();
      if (priceAge < 60 * 60 * 1000) { // Less than 1 hour old
        logger.info(`Using BSV price from database: $${latestStats.currentBsvPrice}`);
        return res.json({
          price: latestStats.currentBsvPrice,
          source: 'database',
          timestamp: latestStats.lastUpdated
        });
      }
    }
    
    // If we don't have a recent price in the database, fetch it
    const price = await fetchBsvPrice();
    
    if (price !== null) {
      return res.json({
        price,
        source: 'api',
        timestamp: new Date()
      });
    }
    
    // If we couldn't fetch the price, return an error
    return res.status(404).json({
      error: 'Failed to fetch BSV price',
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error fetching BSV price', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get BSV price history
 */
export const getBsvPriceHistory = async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || 'all';
    const format = req.query.format as string || 'daily';
    
    // Try to read from the cache file first
    const cacheDir = path.join(__dirname, '../../data');
    const cacheFile = path.join(cacheDir, 'bsv_price_history.json');
    
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      
      if (data && data.length > 0) {
        let filteredData = [...data];
        
        // Filter by period
        if (period === 'week') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          filteredData = filteredData.filter(item => new Date(item.date) >= oneWeekAgo);
        } else if (period === 'month') {
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          filteredData = filteredData.filter(item => new Date(item.date) >= oneMonthAgo);
        } else if (period === 'year') {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          filteredData = filteredData.filter(item => new Date(item.date) >= oneYearAgo);
        }
        
        // Format the data
        if (format === 'monthly') {
          const monthlyData: Record<string, number[]> = {};
          
          for (const item of filteredData) {
            const date = new Date(item.date);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = [];
            }
            
            monthlyData[monthKey].push(item.price);
          }
          
          const formattedData = Object.entries(monthlyData).map(([month, prices]) => {
            const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            return {
              date: month,
              price: parseFloat(average.toFixed(2))
            };
          }).sort((a, b) => a.date.localeCompare(b.date));
          
          return res.json(formattedData);
        } else if (format === 'weekly') {
          const weeklyData: Record<string, number[]> = {};
          
          for (const item of filteredData) {
            const date = new Date(item.date);
            const weekNumber = getWeekNumber(date);
            const weekKey = `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
            
            if (!weeklyData[weekKey]) {
              weeklyData[weekKey] = [];
            }
            
            weeklyData[weekKey].push(item.price);
          }
          
          const formattedData = Object.entries(weeklyData).map(([week, prices]) => {
            const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            return {
              date: week,
              price: parseFloat(average.toFixed(2))
            };
          }).sort((a, b) => a.date.localeCompare(b.date));
          
          return res.json(formattedData);
        } else {
          // Daily format (default)
          return res.json(filteredData);
        }
      }
    }
    
    // If we couldn't read from the cache, try to read from the database
    // For now, return an error
    return res.status(404).json({
      error: 'BSV price history not found',
      message: 'Run the bsv-price-fetcher.ts script to fetch price history'
    });
  } catch (error) {
    logger.error('Error fetching BSV price history', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Helper function to get week number
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
