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
    
    console.log('Search request:', { query: q, limit, type });
    
    const searchType = type as string || 'all';
    const limitValue = parseInt(limit as string) || 50;
    
    const results = await searchPosts(q as string, limitValue, searchType);
    
    // Debug log first few results
    if (results.posts && results.posts.length > 0) {
      console.log(`Found ${results.posts.length} results. First result:`, {
        id: results.posts[0].id,
        content: results.posts[0].content?.substring(0, 30),
        lock_count: results.posts[0].lock_count,
        lock_count_type: typeof results.posts[0].lock_count
      });
    } else {
      console.log('No search results found');
    }
    
    return res.json(results);
  } catch (error) {
    console.error('Error searching posts:', error);
    return res.status(500).json({ error: 'Failed to search posts' });
  }
});

export default router; 