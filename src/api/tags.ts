import express from 'express';
import prisma from '../db';
import { logger } from '../utils/logger';
import { 
  generateTags, 
  getCurrentEventTags, 
  getAllTags,
  updateTag,
  deleteTag,
  incrementTagUsage
} from '../controllers/tagController';

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
    // First check for dynamic tags in the Tag model
    const dynamicTags = await prisma.tag.findMany({
      where: {
        type: 'current_event'
      },
      orderBy: {
        usage_count: 'desc'
      },
      take: 20,
      select: {
        name: true
      }
    });
    
    // If we have dynamic tags, use those first
    if (dynamicTags.length > 0) {
      const tagNames = dynamicTags.map(tag => tag.name);
      logger.info(`Returning ${tagNames.length} dynamic tags`);
      return res.json({ tags: tagNames });
    }
    
    // Fall back to existing behavior if no dynamic tags
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

// Generate new tags from current events
router.post('/generate', generateTags);

// Get current event tags
router.get('/current-events', getCurrentEventTags);

// Get all tags with their metadata
router.get('/all', getAllTags);

// Update a tag
router.put('/:id', updateTag);

// Delete a tag
router.delete('/:id', deleteTag);

// Increment tag usage count
router.post('/usage/:name', incrementTagUsage);

export default router;