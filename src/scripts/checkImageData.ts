import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  try {
    logger.info('Checking posts with image data...');
    
    // Get the direct URL from environment
    const directUrl = process.env.DIRECT_URL;
    logger.info(`Using database URL: ${directUrl ? 'Direct URL is set' : 'Direct URL not found'}`);
    
    // Use direct URL to avoid prepared statement issues with PgBouncer
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: directUrl
        }
      }
    });
    
    logger.info('Querying database for posts with image data...');
    const posts = await prisma.post.findMany({
      where: {
        raw_image_data: {
          not: null
        }
      },
      take: 5
    });
    
    logger.info(`Found ${posts.length} posts with image data`);
    
    for (const post of posts) {
      const imageDataLength = post.raw_image_data ? post.raw_image_data.length : 0;
      const imageDataType = post.raw_image_data ? typeof post.raw_image_data : 'null';
      const isBuffer = post.raw_image_data ? Buffer.isBuffer(post.raw_image_data) : false;
      
      logger.info(`Post ${post.id} (${post.txid}):`, {
        mediaType: post.media_type,
        imageDataLength,
        imageDataType,
        isBuffer,
        firstFewBytes: post.raw_image_data ? 
          Buffer.from(post.raw_image_data).toString('hex').substring(0, 20) + '...' : 
          'none'
      });
    }
    
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error checking image data:', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
