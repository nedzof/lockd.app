import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient({
  log: ['query', 'error']
});

router.get('/', async (req, res) => {
  try {
    console.log('Received request for posts with query:', req.query);

    const {
      timeFilter,
      rankingFilter,
      personalFilter,
      blockFilter,
      selectedTags,
      userId
    } = req.query;

    // Build the base query
    let where: any = {};

    // Apply time filter
    if (timeFilter) {
      const now = new Date();
      const timeFilters: { [key: string]: number } = {
        '1d': 1,
        '7d': 7,
        '30d': 30
      };
      const days = timeFilters[timeFilter as string];
      if (days) {
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        where.created_at = { gte: startDate };
      }
    }

    // Apply tag filter
    if (selectedTags) {
      const tags = JSON.parse(selectedTags as string);
      if (Array.isArray(tags) && tags.length > 0) {
        where.tags = { hasEvery: tags };
      }
    }

    // Apply personal filters
    if (personalFilter === 'mylocks' && userId) {
      where.author_address = userId;
    }

    console.log('Querying posts with where clause:', where);

    // Get the posts with explicit select
    const posts = await prisma.post.findMany({
      where,
      select: {
        id: true,
        txid: true,
        content: true,
        author_address: true,
        media_type: true,
        block_height: true,
        amount: true,
        unlock_height: true,
        description: true,
        created_at: true,
        tags: true,
        metadata: true,
        is_locked: true,
        lock_duration: true
      },
      orderBy: { created_at: 'desc' }
    });

    console.log(`Found ${posts.length} posts with the following fields:`, 
      posts.length > 0 ? Object.keys(posts[0]) : 'no posts found');

    // Process and return posts
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Add a test endpoint to check database connection
router.get('/test', async (req, res) => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connection successful');
    
    // Get table information
    const tableInfo = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Post'
    `;
    console.log('Post table structure:', tableInfo);
    
    // Count total posts
    const count = await prisma.post.count();
    console.log('Total posts in database:', count);
    
    res.json({ 
      status: 'ok', 
      message: 'Database connection successful',
      postCount: count,
      tableInfo
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 