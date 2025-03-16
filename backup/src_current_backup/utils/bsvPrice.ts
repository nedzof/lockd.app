import axios from 'axios';
import { logger } from './logger';
import * as fs from 'fs';
import path from 'path';

interface WhatsOnChainResponse {
  price: number;
  currency: string;
  timestamp: string;
}

interface BitTailsResponse {
  data: {
    price: number;
    currency: string;
    timestamp: string;
  };
}

interface GorillaPoolResponse {
  price: number;
  currency: string;
  timestamp: string;
}

interface OKXResponse {
  code: string;
  msg: string;
  data: Array<string[]>;
}

/**
 * Fetches the current BSV price from OKX
 * @returns The current BSV price in USD
 */
export const fetchBsvPriceFromOKX = async (): Promise<number | null> => {
  try {
    // OKX API endpoint for candlestick data
    const endpoint = 'https://www.okx.com/api/v5/market/candles';
    
    // BSV-USDT pair, 1-day interval, last 1 candle
    const params = {
      instId: 'BSV-USDT',
      bar: '1D',
      limit: '1'
    };

    logger.info('Fetching BSV price from OKX...');
    const response = await axios.get<OKXResponse>(endpoint, { params });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      // OKX returns data in this format: [timestamp, open, high, low, close, vol, volCcy]
      const closePrice = parseFloat(response.data.data[0][4]);
      logger.info(`Fetched BSV price from OKX: $${closePrice}`);
      return closePrice;
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching BSV price from OKX', { error });
    return null;
  }
};

/**
 * Fetches the current BSV price from WhatsOnChain
 * @returns The current BSV price in USD
 */
export const fetchBsvPriceFromWhatsOnChain = async (): Promise<number | null> => {
  try {
    const response = await axios.get<WhatsOnChainResponse>('https://api.whatsonchain.com/v1/bsv/main/exchangerate');
    
    if (response.data && response.data.price) {
      logger.info(`Fetched BSV price from WhatsOnChain: $${response.data.price}`);
      return response.data.price;
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching BSV price from WhatsOnChain', { error });
    return null;
  }
};

/**
 * Fetches the current BSV price from BitTails
 * @returns The current BSV price in USD
 */
export const fetchBsvPriceFromBitTails = async (): Promise<number | null> => {
  try {
    const response = await axios.get<BitTailsResponse>('https://api.bittails.io/v1/price/bsv');
    
    if (response.data && response.data.data && response.data.data.price) {
      logger.info(`Fetched BSV price from BitTails: $${response.data.data.price}`);
      return response.data.data.price;
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching BSV price from BitTails', { error });
    return null;
  }
};

/**
 * Fetches the current BSV price from GorillaPool
 * @returns The current BSV price in USD
 */
export const fetchBsvPriceFromGorillaPool = async (): Promise<number | null> => {
  try {
    const response = await axios.get<GorillaPoolResponse>('https://api.gorillapool.io/v1/price/bsv');
    
    if (response.data && response.data.price) {
      logger.info(`Fetched BSV price from GorillaPool: $${response.data.price}`);
      return response.data.price;
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching BSV price from GorillaPool', { error });
    return null;
  }
};

/**
 * Attempts to read BSV price data from the local cache file
 * @returns The cached BSV price data or null if not available
 */
export const readBsvPriceFromCache = (): { price: number, timestamp: number } | null => {
  try {
    const cacheDir = path.join(__dirname, '../../data');
    const cacheFile = path.join(cacheDir, 'bsv_price_history.json');
    
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      
      if (data && data.length > 0 && data[0].price) {
        logger.info(`Read BSV price from cache: $${data[0].price}`);
        return {
          price: data[0].price,
          timestamp: new Date(data[0].date).getTime()
        };
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Error reading BSV price from cache', { error });
    return null;
  }
};

/**
 * Fetches the current BSV price from multiple sources and returns the first valid price
 * @returns The current BSV price in USD
 */
export const fetchBsvPrice = async (): Promise<number | null> => {
  // Try each source in order until we get a valid price
  const price = await fetchBsvPriceFromOKX() || 
                await fetchBsvPriceFromWhatsOnChain() || 
                await fetchBsvPriceFromBitTails() || 
                await fetchBsvPriceFromGorillaPool();
  
  if (price !== null) {
    return price;
  }
  
  // If all online sources fail, try to read from cache
  const cachedData = readBsvPriceFromCache();
  if (cachedData !== null) {
    // Only use cache if it's less than 24 hours old
    const cacheAge = Date.now() - cachedData.timestamp;
    if (cacheAge < 24 * 60 * 60 * 1000) {
      logger.info(`Using cached BSV price: $${cachedData.price}`);
      return cachedData.price;
    }
  }
  
  // If all sources fail, log an error and return null
  logger.error('Failed to fetch BSV price from all sources');
  return null;
};

/**
 * Checks if a field exists in a database table
 * @param prisma Prisma client instance
 * @param tableName Name of the table
 * @param columnName Name of the column
 * @returns True if the column exists, false otherwise
 */
export const checkIfColumnExists = async (prisma: any, tableName: string, columnName: string): Promise<boolean> => {
  try {
    // Query the information_schema to check if the column exists
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
    logger.error(`Error checking if column ${columnName} exists in table ${tableName}`, { error });
    return false;
  }
};
