import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  try {
    // Create initial stats record
    const stats = await prisma.$executeRaw`
      INSERT INTO "stats" (
        "id", 
        "total_posts", 
        "total_votes", 
        "total_lock_likes", 
        "total_users", 
        "total_bsv_locked", 
        "avg_lock_duration", 
        "most_used_tag", 
        "most_active_user", 
        "last_updated"
      ) 
      VALUES (
        ${randomUUID()}, 
        125, 
        78, 
        230, 
        45, 
        1250, 
        14.5, 
        'bitcoin', 
        '1FkGsm1pQtWJNXvpvNfJUyjv2yenNaV5EW', 
        NOW()
      )
    `;

    console.log('Created stats record');
  } catch (error) {
    console.error('Error seeding stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
