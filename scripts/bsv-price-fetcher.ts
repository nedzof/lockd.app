import axios from 'axios';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeInCurrency: number;
}

interface PriceData {
  date: string;
  price: number;
}

async function fetchBSVPriceHistory(): Promise<PriceData[]> {
  try {
    // OKX API endpoint for candlestick data
    const endpoint = 'https://www.okx.com/api/v5/market/candles';
    
    // BSV-USDT pair, 1-day interval, last 60 candles
    const params = {
      instId: 'BSV-USDT',
      bar: '1D',
      limit: '60'
    };

    console.log('Fetching BSV price data from OKX...');
    const response = await axios.get(endpoint, { params });
    
    if (!response.data || !response.data.data) {
      throw new Error('Invalid response from OKX API');
    }

    // Process the candle data
    const priceData: PriceData[] = response.data.data.map((candle: string[]) => {
      // OKX returns data in this format: [timestamp, open, high, low, close, vol, volCcy]
      const timestamp = parseInt(candle[0]);
      const closePrice = parseFloat(candle[4]);
      
      // Convert timestamp to date string (OKX timestamps are in milliseconds)
      const date = new Date(timestamp).toISOString().split('T')[0];
      
      return {
        date,
        price: closePrice
      };
    });

    // Sort by date (newest first)
    priceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    console.log(`Successfully fetched ${priceData.length} days of BSV price data`);
    return priceData;
  } catch (error) {
    console.error('Error fetching BSV price data:', error);
    throw error;
  }
}

// Function to save data to JSON file (for testing/backup)
function saveToJson(data: PriceData[], filename: string): void {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${filename}`);
}

// Function to insert data into the database
async function insertIntoDatabase(priceData: PriceData[]): Promise<void> {
  const prisma = new PrismaClient();
  
  try {
    console.log('Inserting BSV price data into database...');
    
    // Check if the current_bsv_price column exists
    const columnExists = await checkIfColumnExists(prisma, 'stats', 'current_bsv_price');
    
    if (!columnExists) {
      console.log('The current_bsv_price column does not exist, adding it...');
      
      // Add the column if it doesn't exist
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "stats" 
        ADD COLUMN IF NOT EXISTS "current_bsv_price" DOUBLE PRECISION
      `);
      
      console.log('Successfully added current_bsv_price column to stats table');
    }
    
    // Get the latest stats record
    const latestStats = await prisma.stats.findFirst({
      orderBy: {
        lastUpdated: 'desc'
      }
    });
    
    if (!latestStats) {
      console.log('No stats record found, creating a new one...');
      return;
    }
    
    // Update the latest stats record with the current price
    const currentPrice = priceData[0].price;
    
    console.log(`Updating stats record with current BSV price: $${currentPrice}`);
    
    await prisma.$executeRawUnsafe(`
      UPDATE "stats"
      SET "current_bsv_price" = ${currentPrice}
      WHERE "id" = '${latestStats.id}'
    `);
    
    console.log('Successfully updated stats record with current BSV price');
    
    // Create a table for historical price data if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "bsv_price_history" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE UNIQUE NOT NULL,
        "price" DOUBLE PRECISION NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert price data
    for (const record of priceData) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "bsv_price_history" ("date", "price")
        VALUES ('${record.date}', ${record.price})
        ON CONFLICT ("date") DO UPDATE SET "price" = ${record.price}
      `);
    }
    
    console.log(`Successfully inserted ${priceData.length} price records into database`);
  } catch (error) {
    console.error('Error inserting data into database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to check if a column exists in a table
async function checkIfColumnExists(prisma: PrismaClient, tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        AND column_name = ${columnName}
      );
    `;
    
    return result[0].exists;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error);
    return false;
  }
}

// Function to get weekly averages
function getWeeklyAverages(priceData: PriceData[]): Record<string, number> {
  const weeklyPrices: Record<string, number[]> = {};
  
  for (const record of priceData) {
    const date = new Date(record.date);
    const year = date.getFullYear();
    const weekNumber = getWeekNumber(date);
    const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    
    if (!weeklyPrices[weekKey]) {
      weeklyPrices[weekKey] = [];
    }
    
    weeklyPrices[weekKey].push(record.price);
  }
  
  const weeklyAverages: Record<string, number> = {};
  for (const [week, prices] of Object.entries(weeklyPrices)) {
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    weeklyAverages[week] = parseFloat(average.toFixed(2));
  }
  
  return weeklyAverages;
}

// Function to get monthly averages
function getMonthlyAverages(priceData: PriceData[]): Record<string, number> {
  const monthlyPrices: Record<string, number[]> = {};
  
  for (const record of priceData) {
    const date = new Date(record.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    
    if (!monthlyPrices[monthKey]) {
      monthlyPrices[monthKey] = [];
    }
    
    monthlyPrices[monthKey].push(record.price);
  }
  
  const monthlyAverages: Record<string, number> = {};
  for (const [month, prices] of Object.entries(monthlyPrices)) {
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    monthlyAverages[month] = parseFloat(average.toFixed(2));
  }
  
  return monthlyAverages;
}

// Helper function to get week number
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Function to format price data for the frontend chart
function formatPriceDataForChart(priceData: PriceData[]): Array<{ name: string; price: number }> {
  // Get the last 6 months of data
  const last6Months = priceData.slice(0, 6);
  
  // Format the data for the chart
  return last6Months.map(record => {
    // Convert ISO date to month name
    const date = new Date(record.date);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    
    return {
      name: monthName,
      price: record.price
    };
  }).reverse(); // Reverse to show oldest to newest
}

// Main function
async function main() {
  try {
    const priceData = await fetchBSVPriceHistory();
    
    // Save to JSON file (optional, for backup/testing)
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    saveToJson(priceData, path.join(dataDir, 'bsv_price_history.json'));
    
    // Calculate weekly and monthly averages
    const weeklyAverages = getWeeklyAverages(priceData);
    const monthlyAverages = getMonthlyAverages(priceData);
    
    console.log('Weekly Averages:', weeklyAverages);
    console.log('Monthly Averages:', monthlyAverages);
    
    // Format data for frontend chart
    const chartData = formatPriceDataForChart(priceData);
    saveToJson(chartData, path.join(dataDir, 'bsv_price_chart_data.json'));
    
    // Insert data into database
    await insertIntoDatabase(priceData);
    
    console.log('BSV price data processing completed successfully');
  } catch (error) {
    console.error('Failed to process BSV price data:', error);
    process.exit(1);
  }
}

// Run the script
main();
