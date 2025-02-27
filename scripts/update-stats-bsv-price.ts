import { PrismaClient } from '@prisma/client';
import { fetchBsvPrice } from '../src/utils/bsvPrice.js';
import { logger } from '../src/utils/logger.js';

const prisma = new PrismaClient();

async function updateStatsBsvPrice() {
  try {
    logger.info('Fetching current BSV price...');
    const currentBsvPrice = await fetchBsvPrice();
    
    if (currentBsvPrice === null) {
      logger.error('Failed to fetch BSV price from all sources');
      return;
    }
    
    logger.info(`Current BSV price: $${currentBsvPrice}`);
    
    // Get the latest stats record
    const stats = await prisma.stats.findFirst({
      orderBy: {
        last_updated: 'desc'
      }
    });
    
    if (!stats) {
      logger.warn('No stats record found to update');
      return;
    }
    
    // Update the stats record with the current BSV price
    const updatedStats = await prisma.stats.update({
      where: {
        id: stats.id
      },
      data: {
        current_bsv_price: currentBsvPrice,
        last_updated: new Date()
      }
    });
    
    logger.info(`Successfully updated stats with current BSV price: $${currentBsvPrice}`);
    logger.info(`Updated stats record: ${JSON.stringify(updatedStats)}`);
  } catch (error) {
    logger.error('Error updating stats BSV price', { error });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateStatsBsvPrice();
