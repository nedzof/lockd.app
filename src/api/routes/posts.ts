import express from 'express';
import { searchPosts } from '../posts';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Search posts endpoint
router.get('/search', async (req, res) => {
  try {
    // Validate search term
    const searchTerm = req.query.q as string;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    // Get filters & pagination from query params
    const limit = parseInt(req.query.limit as string) || 20;
    const searchType = req.query.type as string || 'all';
    
    // Apply various filters if provided
    const time_filter = req.query.time_filter as string || undefined;
    const ranking_filter = req.query.ranking_filter as string || undefined;
    const personal_filter = req.query.personal_filter as string || undefined;
    const block_filter = req.query.block_filter as string || undefined;
    const tags = Array.isArray(req.query.tags) ? req.query.tags as string[] : 
                (req.query.tags ? [req.query.tags as string] : undefined);
    const user_id = req.query.user_id as string || undefined;
    
    // Log all filters being applied
    console.log(`SEARCH: Term="${searchTerm}", Type=${searchType}, Filters:`, {
      time_filter,
      ranking_filter, 
      personal_filter,
      block_filter,
      tags: tags?.join(','),
      user_id
    });
    
    // Call the search function (passing all filters)
    const results = await searchPosts(
      searchTerm, 
      limit, 
      searchType, 
      {
        time_filter,
        ranking_filter,
        personal_filter,
        block_filter,
        tags,
        user_id
      }
    );
    
    // Set correct content type for the response
    res.setHeader('Content-Type', 'application/json');
    
    // Check if results are valid
    if (!results || !results.posts) {
      console.error('Search returned invalid results:', results);
      return res.status(500).json({ error: 'Invalid search results format' });
    }
    
    // Process the results to remove binary data and clean up content
    const cleanedPosts = results.posts.map((post: any) => {
      // Create a clean post object without binary data
      const cleanPost = {
        id: post.id,
        tx_id: post.tx_id,
        content: post.content,
        author_address: post.author_address,
        created_at: post.created_at,
        tags: post.tags || [],
        media_type: post.media_type || null,
        has_image: post.media_type ? true : false,
        media_url: post.media_url || null,
        is_locked: post.is_locked || false,
        is_vote: post.is_vote || false,
        vote_options: post.vote_options || [],
        description: post.description || null,
        lock_count: post.lock_count || 0,
        metadata: post.metadata || null
      };
      
      // Remove any null/undefined values to clean up the response
      Object.keys(cleanPost).forEach(key => {
        // @ts-ignore
        if (cleanPost[key] === null || cleanPost[key] === undefined) {
          // @ts-ignore
          delete cleanPost[key];
        }
      });
      
      return cleanPost;
    });
    
    // Return the cleaned results
    return res.json({
      count: results.count,
      posts: cleanedPosts,
      hasMore: results.hasMore,
      nextCursor: results.nextCursor
    });
  } catch (error) {
    console.error('Search error details:', error);
    // Log the stack trace for debugging
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
      return res.status(500).json({ error: 'Failed to search posts', message: error.message });
    }
    res.status(500).json({ error: 'Failed to search posts' });
  }
});

// Transaction lookup endpoint
router.get('/tx/:txId', async (req, res) => {
  try {
    const { txId } = req.params;
    
    // Validate transaction ID format
    if (!txId || !/^[0-9a-fA-F]{64}$/.test(txId)) {
      return res.status(400).json({ error: 'Invalid transaction ID format' });
    }
    
    // Look up the post by transaction ID
    const post = await prisma.post.findUnique({
      where: {
        tx_id: txId
      },
      include: {
        vote_options: true,
        lock_likes: true
      }
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Process the post to create a clean version without binary data
    const cleanPost = {
      id: post.id,
      tx_id: post.tx_id,
      content: post.content,
      author_address: post.author_address,
      created_at: post.created_at,
      tags: post.tags,
      media_type: post.media_type,
      has_image: post.media_type ? true : false, // Use media_type to determine if there's an image
      media_url: (post as any).media_url || null,
      is_locked: (post as any).is_locked,
      is_vote: (post as any).is_vote,
      vote_options: post.vote_options,
      description: (post as any).description,
      lock_count: post.lock_likes?.length || 0,
      metadata: (post as any).metadata
    };
    
    return res.json({ post: cleanPost });
  } catch (error) {
    console.error('Transaction lookup error:', error);
    res.status(500).json({ error: 'Failed to look up transaction' });
  }
});

export default router; 