import express from 'express';
import { searchPosts } from '../posts';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Search posts endpoint
router.get('/search', async (req, res) => {
  try {
    const { 
      q, limit, type, 
      time_filter, ranking_filter, personal_filter, block_filter, tags, user_id 
    } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    console.log('Search request:', { 
      query: q, 
      limit, 
      type,
      time_filter,
      ranking_filter,
      personal_filter,
      block_filter,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      user_id
    });
    
    const searchType = type as string || 'all';
    const limitValue = parseInt(limit as string) || 50;
    
    // Pass all filter parameters to searchPosts
    const results = await searchPosts(
      q as string, 
      limitValue, 
      searchType,
      {
        time_filter: time_filter as string,
        ranking_filter: ranking_filter as string,
        personal_filter: personal_filter as string,
        block_filter: block_filter as string,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : [],
        user_id: user_id as string,
      }
    );
    
    // Debug log first few results
    if (results.posts && results.posts.length > 0) {
      console.log(`Found ${results.posts.length} results. First result:`, {
        id: results.posts[0].id,
        content: results.posts[0].content?.substring(0, 30),
        lock_count: results.posts[0].lock_count,
        has_image: results.posts[0].has_image,
        media_url: results.posts[0].media_url,
        media_type: results.posts[0].media_type
      });
    } else {
      console.log('No search results found');
    }
    
    // Process the posts to ensure media_url is correctly set
    if (results.posts) {
      results.posts = results.posts.map(post => {
        // If post has an image but no media_url, create one
        if (post.has_image && !post.media_url) {
          post.media_url = `/api/posts/${post.id}/media`;
          console.log(`Added media_url for post ${post.id}: ${post.media_url}`);
        }
        return post;
      });
    }
    
    return res.json(results);
  } catch (error) {
    console.error('Error searching posts:', error);
    return res.status(500).json({ error: 'Failed to search posts' });
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