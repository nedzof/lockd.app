import { PrismaClient } from '@prisma/client';
import { fetchBsvPrice } from '../src/utils/bsvPrice.js';

const prisma = new PrismaClient();

async function initializeStats() {
  try {
    console.log('Checking if stats table has records...');
    
    // Check if there are any records in the stats table
    const statsCount = await prisma.stats.count();
    
    if (statsCount > 0) {
      console.log(`Stats table already has ${statsCount} records. No initialization needed.`);
      return;
    }
    
    console.log('No stats records found. Creating initial stats record...');
    
    // Fetch the current BSV price
    console.log('Fetching current BSV price...');
    const currentBsvPrice = await fetchBsvPrice();
    
    console.log(`Current BSV price: $${currentBsvPrice}`);
    
    // Create a sample stats record
    const stats = await prisma.stats.create({
      data: {
        total_posts: 0,
        total_votes: 0,
        total_lock_likes: 0,
        total_users: 0,
        total_bsv_locked: 0,
        avg_lock_duration: 0,
        most_used_tag: null,
        most_active_user: null,
        current_bsv_price: currentBsvPrice || 35.0,
        last_updated: new Date()
      }
    });
    
    console.log('Successfully created initial stats record:', stats);
  } catch (error) {
    console.error('Error initializing stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the initialization
initializeStats();
