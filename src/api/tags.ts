import express from 'express';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

const router = express.Router();

// Default tags if none are found in the database
const DEFAULT_TAGS = [
  'Politics',
  'Crypto',
  'Sports',
  'Pop Culture',
  'Business',
  'Tech',
  'Current Events',
  'Finance',
  'Health',
  'Memes'
];

router.get('/', async (req, res) => {
  try {
    const uniqueTags = await prisma.post.findMany({
      select: {
        tags: true
      }
    });

    // Flatten and deduplicate tags
    const allTags = uniqueTags
      .flatMap(post => post.tags)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .sort();

    // If no tags found, return default tags
    const tags = allTags.length > 0 ? allTags : DEFAULT_TAGS;

    res.json({ tags });
  } catch (error: any) {
    logger.error('Error fetching tags', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;