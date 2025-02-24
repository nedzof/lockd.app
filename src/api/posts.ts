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

    const lastPost = posts[posts.length - 1];
    const nextCursor = lastPost?.id;

    return res.status(200).json({
      posts,
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

    // Send the raw image data
    res.send(Buffer.from(post.raw_image_data, 'base64'));
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ message: 'Error fetching media' });
  }
};

const createPost: CreatePostHandler = async (req, res, next): Promise<void> => {
  try {
    console.log('Received post creation request with body:', {
      ...req.body,
      raw_image_data: req.body.raw_image_data ? `[base64 data length: ${req.body.raw_image_data.length}]` : null
    });

    // Validate required fields
    const requiredFields = ['txid', 'postId', 'content', 'author_address'] as const;
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      res.status(400).json({
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
      return;
    }

    const {
      txid,
      postId,
      content,
      author_address,
      media_type,
      description,
      tags,
      metadata,
      is_locked,
      lock_duration,
      is_vote,
      vote_options,
      raw_image_data,
      image_format
    } = req.body;

    // Validate data types
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({
        message: 'Content must be a non-empty string'
      });
      return;
    }

    if (typeof author_address !== 'string' || !author_address.trim()) {
      res.status(400).json({
        message: 'Author address must be a non-empty string'
      });
      return;
    }

    // Validate metadata is an object if present
    if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
      res.status(400).json({
        message: 'Metadata must be an object'
      });
      return;
    }

    // Validate tags is an array if present
    if (tags !== undefined && !Array.isArray(tags)) {
      res.status(400).json({
        message: 'Tags must be an array'
      });
      return;
    }

    // Create the post
    try {
      const post = await prisma.post.create({
        data: {
          id: postId,
          txid,
          postId,
          content,
          author_address,
          media_type,
          block_height: 0, // Will be updated by scanner
          description,
          tags: tags || [],
          metadata: metadata || {},
          is_locked: is_locked || false,
          lock_duration,
          is_vote: is_vote || false,
          raw_image_data: raw_image_data || null,
          image_format: image_format || null,
          vote_options: vote_options ? {
            create: vote_options.map((option: any, index: number) => ({
              id: `${postId}-option-${index}`,
              txid: `${txid}-option-${index}`,
              postId,
              content: option.text,
              author_address,
              created_at: new Date(),
              lock_amount: option.lockAmount || 0,
              lock_duration: option.lockDuration || 0,
              unlock_height: 0,
              current_height: 0,
              lock_percentage: 0,
              tags: []
            }))
          } : undefined
        },
        include: {
          vote_options: true
        }
      });

      console.log('Successfully created post:', {
        ...post,
        raw_image_data: post.raw_image_data ? `[base64 data length: ${post.raw_image_data.length}]` : null
      });
      
      res.json(post);
      return;
    } catch (dbError) {
      console.error('Database error while creating post:', dbError);
      
      // Check for specific database errors
      if (dbError instanceof Error) {
        if (dbError.message.includes('Unique constraint')) {
          res.status(409).json({
            message: 'A post with this ID already exists'
          });
          return;
        }
        
        if (dbError.message.includes('Foreign key constraint')) {
          res.status(400).json({
            message: 'Invalid reference in vote options'
          });
          return;
        }
      }
      
      // Generic database error
      res.status(500).json({
        message: 'Failed to create post in database',
        error: dbError instanceof Error ? dbError.message : 'Unknown database error'
      });
      return;
    }
  } catch (error) {
    console.error('Error processing post creation request:', error);
    res.status(500).json({
      message: 'Error processing post creation request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
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