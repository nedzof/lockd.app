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

// Transaction lookup endpoint - for direct TX ID lookups
router.get('/tx/:txId', async (req, res) => {
  const txId = req.params.txId;
  
  if (!txId || !/^[0-9a-fA-F]{64}$/.test(txId)) {
    return res.status(400).json({ error: 'Invalid transaction ID format' });
  }
  
  try {
    console.log(`Looking up transaction: ${txId}`);
    
    // Search specifically for this exact transaction ID
    const results = await searchPosts(txId, 1, 'tx');
    
    if (results && results.posts && results.posts.length > 0) {
      return res.json({
        success: true,
        post: results.posts[0],
      });
    } else {
      return res.status(404).json({ 
        error: 'Transaction not found in database',
        success: false
      });
    }
  } catch (error) {
    console.error('Transaction lookup error:', error);
    return res.status(500).json({ 
      error: 'Failed to lookup transaction',
      success: false
    });
  }
});

export default router; 