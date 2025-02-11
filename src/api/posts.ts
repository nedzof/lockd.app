import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
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

    // Get the posts
    const posts = await prisma.post.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });

    // Process and return posts
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

export default router; 