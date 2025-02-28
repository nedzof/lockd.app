import { Request, Response } from 'express';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';
import { TagDatabaseService } from '../services/tagDatabaseService';

const tagService = new TagDatabaseService();

/**
 * Generate tags for a post and apply them
 */
export const generateTagsForPost = async (req: Request, res: Response) => {
  const { post_id } = req.params;
  
  try {
    // Validate post ID
    if (!post_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Post ID is required' 
      });
    }
    
    // Find the post
    const post = await prisma.post.findUnique({
      where: { id: post_id },
      select: {
        id: true,
        content: true,
        tags: true
      }
    });
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        error: 'Post not found' 
      });
    }
    
    // Generate and apply tags
    const tags = await tagService.applyTagsToPost(post_id, post.content);
    
    // Return the updated post with new tags
    res.json({
      success: true,
      data: {
        post_id,
        previousTags: post.tags,
        newTags: tags,
        count: tags.length
      }
    });
  } catch (error: any) {
    logger.error(`Error generating tags for post ${post_id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate tags for post' 
    });
  }
};

/**
 * Generate tags from arbitrary content
 */
export const generateTagsFromContent = async (req: Request, res: Response) => {
  try {
    const { content, type = 'ai', maxTags = 30 } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const tagDatabaseService = new TagDatabaseService();
    
    // Generate tags from content
    const tags = await tagDatabaseService.generateTags(content, type, maxTags);
    
    return res.status(200).json({ tags });
  } catch (error) {
    console.error('Error generating tags from content:', error);
    return res.status(500).json({ error: 'Failed to generate tags' });
  }
};

/**
 * Generate tags for all recent posts
 */
export const generateTagsForRecentPosts = async (req: Request, res: Response) => {
  try {
    // Get recent posts without tags
    const recentPosts = await prisma.post.findMany({
      where: {
        tags: {
          isEmpty: true
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 20,
      select: {
        id: true,
        content: true
      }
    });
    
    if (recentPosts.length === 0) {
      return res.json({
        success: true,
        message: 'No posts found that need tags',
        count: 0
      });
    }
    
    // Generate and apply tags for each post
    const results = [];
    for (const post of recentPosts) {
      const tags = await tagService.applyTagsToPost(post.id, post.content);
      results.push({
        post_id: post.id,
        tagCount: tags.length,
        tags
      });
    }
    
    // Update tag statistics
    await tagService.updateTagStatistics();
    
    res.json({
      success: true,
      data: {
        processedPosts: results.length,
        details: results
      }
    });
  } catch (error: any) {
    logger.error('Error generating tags for recent posts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate tags for recent posts' 
    });
  }
};

/**
 * Get popular tags with usage statistics
 */
export const getPopularTags = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const tags = await tagService.getPopularTags(limit);
    
    res.json({
      success: true,
      data: {
        tags,
        count: tags.length
      }
    });
  } catch (error: any) {
    logger.error('Error fetching popular tags:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch popular tags' 
    });
  }
};
