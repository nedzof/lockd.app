import express, { Router, RequestHandler } from 'express';
import prisma from '../db/prisma';
import { validateQueryParams } from '../utils/validation';
import type { DirectPostBody } from '../types';
import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../utils/logger';

// Define request parameter types
interface PostParams {
  id: string;
}

// Define query parameter types
interface PostQueryParams {
  timeFilter?: string;
  rankingFilter?: string;
  personalFilter?: string;
  blockFilter?: string;
  selectedTags?: string;
  userId?: string;
}

// Define request body type for post creation
interface CreatePostBody {
  txid: string;
  postId: string;
  content: string;
  author_address: string;
  media_type?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  is_locked?: boolean;
  lock_duration?: number;
  is_vote?: boolean;
  vote_options?: Array<{
    text: string;
    lockAmount: number;
    lockDuration: number;
    index: number;
  }>;
  [key: string]: any; // Add index signature for dynamic field access
}

// Define request body type for direct post creation
interface DirectPostBody {
  postId: string;
  content: string;
  author_address: string;
  raw_image_data?: string | null;
  media_type?: string | null;
  description?: string;
  tags?: string[];
  prediction_market_data?: any;
  isLocked: boolean;
  lockDuration?: number;
  lockAmount?: number;
  created_at: string;
}

// Define route handler types
type PostListHandler = RequestHandler<{}, any, any, PostQueryParams>;
type PostDetailHandler = RequestHandler<PostParams>;
type PostMediaHandler = RequestHandler<PostParams>;
type CreatePostHandler = RequestHandler<{}, any, CreatePostBody>;
type CreateDirectPostHandler = RequestHandler<{}, any, DirectPostBody>;

interface PostResponse {
  id: string;
  txid: string;
  content: string;
  author_address: string;
  created_at: Date;
  tags: string[];
  media_type?: string | null;
  raw_image_data?: Buffer | null;
}

interface VoteOptionResponse {
  id: string;
  txid: string;
  content: string;
  author_address: string | null;
  created_at: Date;
  lock_amount: number;
  lock_duration: number;
  unlock_height: number | null;
  tags: string[];
  post_id: string;
}

const listPosts: PostListHandler = async (req, res, next) => {
  try {
    const { cursor, limit = '10', tags = [], excludeVotes = 'false' } = req.query;
    const parsedLimit = Math.min(parseInt(limit as string, 10), 50);
    const parsedExcludeVotes = excludeVotes === 'true';
    
    const posts = await prisma.post.findMany({
      take: parsedLimit,
      ...(cursor ? { 
        cursor: { 
          id: cursor as string 
        },
        skip: 1
      } : {}),
      where: {
        AND: [
          ...(tags.length > 0 ? [{
            tags: {
              hasEvery: Array.isArray(tags) ? tags : [tags]
            }
          }] : []),
          ...(parsedExcludeVotes ? [{
            is_vote: false
          }] : [])
        ]
      },
      orderBy: [
        { created_at: 'desc' },
        { id: 'desc' }
      ],
      include: {
        vote_options: true,
        lock_likes: {
          orderBy: { created_at: 'desc' }
        }
      }
    });

    // Process posts to handle raw_image_data
    const processedPosts = posts.map(post => {
      // Process raw_image_data to ensure it's in the correct format for the frontend
      if (post.raw_image_data) {
        try {
          // Convert Bytes to base64 string for frontend use
          post.raw_image_data = Buffer.from(post.raw_image_data).toString('base64');
          logger.debug('Converted raw_image_data from Bytes to base64 string', {
            postId: post.id,
            dataLength: post.raw_image_data.length
          });
        } catch (e) {
          logger.error('Error processing raw_image_data', {
            error: e instanceof Error ? e.message : 'Unknown error',
            postId: post.id
          });
        }
      }
      return post;
    });

    const lastPost = processedPosts[processedPosts.length - 1];
    const nextCursor = lastPost?.id;

    return res.status(200).json({
      posts: processedPosts,
      nextCursor
    });
  } catch (error: any) {
    logger.error('Error fetching posts', {
      error: error.message,
      code: error.code
    });

    // Return appropriate error response
    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    return res.status(500).json({ 
      error: 'Internal server error'
    });
  }
};

const getPost: PostDetailHandler = async (req, res, next) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        vote_options: true
      }
    });

    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    // Process raw_image_data to ensure it's in the correct format for the frontend
    if (post.raw_image_data) {
      try {
        // Convert Bytes to base64 string for frontend use
        post.raw_image_data = Buffer.from(post.raw_image_data).toString('base64');
        logger.debug('Converted raw_image_data from Bytes to base64 string', {
          postId: post.id,
          dataLength: post.raw_image_data.length
        });
      } catch (e) {
        logger.error('Error processing raw_image_data', {
          error: e instanceof Error ? e.message : 'Unknown error',
          postId: post.id
        });
      }
    }

    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ message: 'Error fetching post' });
  }
};

const getPostMedia: PostMediaHandler = async (req, res, next) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: {
        media_type: true,
        raw_image_data: true,
        image_format: true
      }
    });

    if (!post || !post.raw_image_data) {
      res.status(404).json({ message: 'Media not found' });
      return;
    }

    // Set appropriate content type
    if (post.media_type) {
      res.setHeader('Content-Type', post.media_type);
    }

    // Log information about the image data
    logger.debug('Sending image data', {
      postId: req.params.id,
      mediaType: post.media_type,
      dataType: typeof post.raw_image_data,
      isBuffer: Buffer.isBuffer(post.raw_image_data),
      dataLength: post.raw_image_data.length
    });

    // Send the raw image data - it's already a Buffer in the database
    res.send(post.raw_image_data);
  } catch (error) {
    logger.error('Error fetching media:', error);
    res.status(500).json({ message: 'Error fetching media' });
  }
};

const createPost: CreatePostHandler = async (req, res, next): Promise<void> => {
  try {
    const { content, author_address, tags, is_vote, vote_options } = req.body;
    
    if (!content || !author_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a unique txid for the post
    const txid = `${author_address}_${Date.now()}`;

    // Create the post
    const post = await prisma.post.create({
      data: {
        txid,
        content,
        author_address,
        created_at: new Date(),
        tags: tags || [],
        is_vote: is_vote || false
      }
    });

    // If this is a vote post, create the vote options
    if (is_vote && vote_options && Array.isArray(vote_options) && vote_options.length >= 2) {
      // Create vote options
      const voteOptionPromises = vote_options.map(option => {
        if (!option || typeof option !== 'string' || !option.trim()) {
          return null; // Skip empty options
        }
        
        return prisma.voteOption.create({
          data: {
            txid: `${post.id}_option_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            content: option.trim(),
            author_address,
            created_at: new Date(),
            post_id: post.id
          }
        });
      });

      await Promise.all(voteOptionPromises.filter(Boolean));
    }

    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error: any) {
    logger.error('Error creating post', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
};

// Handler for direct post creation
const createDirectPost: CreateDirectPostHandler = async (req, res, next): Promise<void> => {
  try {
    console.log('Received direct post creation request');

    const {
      postId,
      content,
      author_address,
      raw_image_data,
      media_type,
      description,
      tags,
      prediction_market_data,
      isLocked,
      lockDuration,
      lockAmount,
      created_at
    } = req.body;

    // Log image data details
    if (raw_image_data) {
      console.log('Image upload details:', {
        hasImageData: true,
        imageDataLength: raw_image_data.length,
        mediaType: media_type,
        imageDataPreview: raw_image_data.substring(0, 100) + '...'
      });
    }

    // Create temporary txid for the post
    const tempTxid = `temp_${postId}_${Date.now()}`;

    const postData = {
      id: tempTxid,
      txid: tempTxid,
      postId,
      content,
      author_address,
      raw_image_data: raw_image_data || null,
      media_type: media_type || null,
      description,
      tags,
      metadata: {
        prediction_market_data,
        app: 'lockd',
        version: '1.0.0',
        lock: {
          isLocked,
          duration: lockDuration,
          amount: lockAmount
        }
      },
      is_locked: isLocked,
      lock_duration: lockDuration,
      created_at: new Date(created_at),
      block_height: null
    } as const;

    const post = await prisma.post.create({
      data: postData as unknown as Prisma.PostCreateInput
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating direct post:', error);
    res.status(500).json({
      message: 'Error creating direct post',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Register routes
const router: Router = express.Router();
router.get('/', listPosts);
router.get('/:id', getPost);
router.get('/:id/media', getPostMedia);
router.post('/', createPost);
router.post('/direct', createDirectPost);

// Add a test endpoint to check database connection
router.get('/test', async (req, res) => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connection successful');
    
    // Get table information
    const tableInfo = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Post'
    `;
    console.log('Post table structure:', tableInfo);
    
    // Count total posts
    const count = await prisma.post.count();
    console.log('Total posts in database:', count);
    
    res.json({ 
      status: 'ok', 
      message: 'Database connection successful',
      postCount: count,
      tableInfo
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 