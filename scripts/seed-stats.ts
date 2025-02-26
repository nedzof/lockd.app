import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Create initial stats record
    const stats = await prisma.stats.create({
      data: {
        total_posts: 125,
        total_votes: 78,
        total_lock_likes: 230,
        total_users: 45,
        total_bsv_locked: 1250,
        avg_lock_duration: 14.5,
        most_used_tag: 'bitcoin',
        most_active_user: '1FkGsm1pQtWJNXvpvNfJUyjv2yenNaV5EW',
        last_updated: new Date()
      }
    });

    console.log('Created stats record:', stats);
  } catch (error) {
    console.error('Error seeding stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
