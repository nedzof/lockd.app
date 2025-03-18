import express from 'express';
import { searchPosts } from '../posts';

const router = express.Router();

// Search posts endpoint
router.get('/search', async (req, res) => {
  try {
    const { q, limit, type } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const searchType = type as string || 'all';
    const limitValue = parseInt(limit as string) || 50;
    
    const results = await searchPosts(q as string, limitValue, searchType);
    return res.json(results);
  } catch (error) {
    console.error('Error searching posts:', error);
    return res.status(500).json({ error: 'Failed to search posts' });
  }
});

export default router; 