import express from 'express';
import { searchPosts } from '../posts';

const router = express.Router();

// Search posts endpoint
router.get('/search', async (req, res) => {
  const searchTerm = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 20;
  const searchType = req.query.type as string || 'all';
  
  if (!searchTerm) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  try {
    console.log(`Searching for "${searchTerm}" with type "${searchType}"`);
    const results = await searchPosts(searchTerm, limit, searchType);
    
    // Format response in the structure expected by PostGrid
    return res.json({
      posts: results.posts || [],
      hasMore: false,  // Search doesn't support pagination yet
      nextCursor: null,
      stats: {
        totalLocked: 0,
        participantCount: 0,
        roundNumber: 0
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Failed to search posts' });
  }
});

export default router; 