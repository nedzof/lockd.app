import express, { Router, RequestHandler } from 'express';
import prisma from '../db/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
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
  time_filter?: string;
  ranking_filter?: string;
  personal_filter?: string;
  block_filter?: string;
  selected_tags?: string;
  user_id?: string;
}

// Define request body type for post creation
interface CreatePostBody {
  tx_id: string;
  post_id: string;
  content: string;
  author_address: string;
  media_type?: string;
  raw_image_data?: string | null;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  is_locked?: boolean;
  lock_duration?: number;
  isVote?: boolean;
  vote_options?: Array<{
    text: string;
    lock_amount: number;
    lock_duration: number;
    index: number;
  }>;
  [key: string]: any; // Add index signature for dynamic field access
}

// Define request body type for direct post creation
interface DirectPostBody {
  post_id: string;
  content: string;
  author_address: string;
  raw_image_data?: string | null;
  media_type?: string | null;
  description?: string;
  tags?: string[];
  predictionMarketData?: any;
  is_locked: boolean;
  lock_duration?: number;
  lock_amount?: number;
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
  tx_id: string;
  content: string;
  author_address: string;
  created_at: Date;
  tags: string[];
  media_type?: string | null;
  raw_image_data?: Buffer | null;
}

interface vote_optionResponse {
  id: string;
  tx_id: string;
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
    
    logger.debug('Fetching posts with params', {
      cursor,
      limit: parsedLimit,
      tags,
      excludeVotes: parsedExcludeVotes
    });
    
    // VALIDATION: Log the exact query we're about to execute
    const queryParams = {
      take: parsedLimit + 1,
      ...(cursor ? { 
        cursor: { 
          id: cursor as string 
        },
        skip: 1 // Skip the cursor item
      } : {}),
      where: {
        AND: [
          ...(tags.length > 0 ? [{
            tags: {
              hasEvery: Array.isArray(tags) ? tags : [tags]
            }
          }] : []),
          ...(parsedExcludeVotes ? [{
            isVote: false
          }] : [])
        ]
      },
      orderBy: [
        { created_at: 'desc' },
        { id: 'desc' }
      ]
    };
    
    logger.debug('Executing Prisma query with params', {
      queryParams: JSON.stringify(queryParams, null, 2)
    });
    
    // First fetch one more item than requested to determine if there are more items
    const posts = await prisma.post.findMany({
      ...queryParams,
      include: {
        vote_options: true,
        lockLikes: {
          orderBy: { created_at: 'desc' }
        }
      }
    });

    // VALIDATION: Log the IDs of posts we found to check for duplicates
    logger.debug('Found posts', {
      count: posts.length,
      requestedLimit: parsedLimit,
      post_ids: posts.map(post => post.id)
    });

    // Check if there are more items
    const hasMore = posts.length > parsedLimit;
    
    // Remove the extra item if we fetched more than requested
    const postsToReturn = hasMore ? posts.slice(0, parsedLimit) : posts;

    // VALIDATION: Log the IDs of posts we're returning
    logger.debug('Posts to return', {
      count: postsToReturn.length,
      post_ids: postsToReturn.map(post => post.id)
    });

    // Process posts to handle raw_image_data
    const processedPosts = postsToReturn.map(post => {
      // Process raw_image_data to ensure it's in the correct format for the frontend
      if (post.raw_image_data) {
        try {
          // Convert Bytes to base64 string for frontend use
          post.raw_image_data = Buffer.from(post.raw_image_data).toString('base64');
          logger.debug('Converted raw_image_data from Bytes to base64 string', {
            post_id: post.id,
            dataLength: post.raw_image_data.length
          });
        } catch (e) {
          logger.error('Error processing raw_image_data', {
            error: e instanceof Error ? e.message : 'Unknown error',
            post_id: post.id
          });
        }
      }
      return post;
    });

    const lastPost = postsToReturn[postsToReturn.length - 1];
    const nextCursor = hasMore ? lastPost?.id : null;

    logger.debug('Returning posts with pagination info', {
      postsCount: processedPosts.length,
      nextCursor,
      hasMore
    });

    return res.status(200).json({
      posts: processedPosts,
      nextCursor,
      hasMore
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
          post_id: post.id,
          dataLength: post.raw_image_data.length
        });
      } catch (e) {
        logger.error('Error processing raw_image_data', {
          error: e instanceof Error ? e.message : 'Unknown error',
          post_id: post.id
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
        imageFormat: true
      }
    });

    if (!post || !post.raw_image_data) {
      res.status(404).json({ message: 'Media not found' });
      return;
    }

    // Map of content types for different formats
    const content_typeMap: Record<string, string> = {
      'jpeg': 'image/jpeg',
      'jpg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'tiff': 'image/tiff'
    };

    // Determine content type
    let content_type = post.media_type;
    
    // If we have an imageFormat but no media_type, try to determine from format
    if (!content_type && post.imageFormat && content_typeMap[post.imageFormat.toLowerCase()]) {
      content_type = content_typeMap[post.imageFormat.toLowerCase()];
    }
    
    // Default to octet-stream if we can't determine the type
    if (!content_type) {
      content_type = 'application/octet-stream';
    }

    // Set appropriate content type
    res.setHeader('Content-Type', content_type);

    // Add cache control headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('ETag', `"${req.params.id}"`);

    // Log information about the image data
    logger.debug('Sending image data', {
      post_id: req.params.id,
      media_type: content_type,
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

const createPost: CreatePostHandler = async (req, res, next) => {
  try {
    console.log('Received post creation request with body:', req.body);
    
    // Log database information for debugging
    try {
      const dbInfo = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Post'
      `;
      console.log('Post table schema:', dbInfo);
      
      // Debug available Prisma post fields
      const postFields = Object.keys(prisma.post.fields || {});
      console.log('Available Prisma post fields:', postFields);
    } catch (e) {
      console.error('Failed to query schema information:', e);
    }
    
    // Extract post data from request body
    const {
      content,
      author_address,
      tags = [],
      isVote = false,
      vote_options = [],
      raw_image_data,
      media_type,
      tx_id,
      post_id: clientProvidedpost_id // Extract post_id if client provides it
    } = req.body;

    // Validate required fields
    if (!content && !raw_image_data) {
      console.error('Missing required fields: content or raw_image_data');
      return res.status(400).json({ error: 'Content or image is required' });
    }

    if (!author_address) {
      console.error('Missing required field: author_address');
      return res.status(400).json({ error: 'Author address is required' });
    }

    // Validate image format if provided
    if (raw_image_data && media_type) {
      const supportedFormats = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif', 
        'image/bmp', 
        'image/svg+xml', 
        'image/webp', 
        'image/tiff'
      ];
      
      if (!supportedFormats.includes(media_type)) {
        console.error('Unsupported image format:', media_type);
        return res.status(400).json({ 
          error: 'Unsupported image format. Please use JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF.' 
        });
      }
    }

    // Validate vote options if this is a vote post
    if (isVote && (!vote_options || vote_options.length < 2)) {
      console.error('Invalid vote options:', vote_options);
      return res.status(400).json({ error: 'Vote posts require at least 2 valid options' });
    }

    // Generate temporary transaction ID if not provided
    const temptx_id = tx_id || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`Creating post with ID: ${temptx_id}, clientProvidedpost_id: ${clientProvidedpost_id}`);
    
    // Create a minimal post with required fields
    try {
      const post = await prisma.post.create({
        data: {
          id: temptx_id,
          tx_id: temptx_id,
          content: content,
          author_address: author_address,
          tags: tags || [],
          isVote: isVote || false,
          metadata: clientProvidedpost_id ? { post_id: clientProvidedpost_id } : undefined
        }
      });

      // If we succeeded with minimal data, now try to update with image if provided
      if (raw_image_data) {
        try {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              raw_image_data: raw_image_data ? Buffer.from(raw_image_data, 'base64') : null,
              media_type: media_type || null
            }
          });
        } catch (imageError) {
          console.error('Error updating post with image data:', imageError);
          // We'll continue since the post was already created
        }
      }

      console.log('Post created successfully:', post);

      // If this is a vote post, create vote options
      if (isVote && vote_options && vote_options.length >= 2) {
        // Create vote options
        const vote_optionPromises = vote_options.map(async (option: any, index: number) => {
          const vote_option_id = `vote_option_${temptx_id}_${index}`;
          return prisma.vote_option.create({
            data: {
              id: vote_option_id,
              tx_id: `${temptx_id}_option_${index}`,
              content: option.text,
              post_id: post.id,
              author_address: author_address,
              optionIndex: index
            }
          });
        });

        await Promise.all(vote_optionPromises);
      }

      // Return the created post
      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  } catch (error) {
    console.error('Error creating post:', error);
    // Provide more detailed error information
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Prisma error code: ${error.code}, message: ${error.message}`);
      
      // Handle specific Prisma errors
      if (error.code === 'P2002') {
        return res.status(409).json({ 
          error: 'Conflict error', 
          message: 'A post with this ID already exists',
          details: error.meta
        });
      }
    }
    
    // For other types of errors, return a more informative response
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
};

// Handler for direct post creation
const createDirectPost: CreateDirectPostHandler = async (req, res) => {
  try {
    console.log('Received direct post creation request with body:', {
      ...req.body,
      raw_image_data: req.body.raw_image_data ? `[Image data length: ${req.body.raw_image_data.length}]` : null
    });
    
    // Extract post data from request body
    const {
      post_id,
      content,
      author_address,
      raw_image_data,
      media_type,
      tags = [],
      is_locked = false,
      lock_amount = 0,
      created_at = new Date().toISOString()
    } = req.body;

    // Validate required fields
    if (!content && !raw_image_data) {
      console.error('Missing required fields: content or raw_image_data');
      return res.status(400).json({ error: 'Content or image is required' });
    }

    if (!author_address) {
      console.error('Missing required field: author_address');
      return res.status(400).json({ error: 'Author address is required' });
    }

    // Validate image format if provided
    if (raw_image_data && media_type) {
      const supportedFormats = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif', 
        'image/bmp', 
        'image/svg+xml', 
        'image/webp', 
        'image/tiff'
      ];
      
      if (!supportedFormats.includes(media_type)) {
        console.error('Unsupported image format:', media_type);
        return res.status(400).json({ 
          error: 'Unsupported image format. Please use JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF.' 
        });
      }
      
      // Log image details for debugging
      console.log('Image upload details:', {
        has_imageData: true,
        imageDataLength: raw_image_data.length,
        media_type: media_type,
        imageDataPreview: raw_image_data.substring(0, 100) + '...'
      });
    }

    // Create temporary tx_id for the post
    const temptx_id = `temp_${post_id}_${Date.now()}`;
    
    // Prepare metadata for scanner processing
    const metadata = {
      predictionMarketData,
      app: 'lockd',
      version: '1.0.0',
      lock: {
        is_locked,
        amount: lock_amount
      },
      // Add scanner-related metadata
      scanner: {
        status: 'pending',
        processedAt: null
      }
    };

    const postData = {
      id: temptx_id,
      tx_id: temptx_id,
      content,
      author_address,
      raw_image_data: raw_image_data || null,
      media_type: media_type || null,
      tags,
      metadata,
      is_locked,
      created_at: new Date(created_at),
      block_height: null
    } as const;

    const post = await prisma.post.create({
      data: {
        id: postData.id,
        tx_id: postData.tx_id,
        content: postData.content,
        author_address: postData.author_address,
        raw_image_data: postData.raw_image_data ? Buffer.from(postData.raw_image_data) : null,
        media_type: postData.media_type,
        tags: postData.tags,
        metadata: postData.metadata,
        is_locked: postData.is_locked,
        created_at: postData.created_at,
        block_height: postData.block_height
      }
    });

    console.log(`Direct post created successfully with ID: ${post.id}, ready for scanner processing`);
    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating direct post:', error);
    
    // Provide more detailed error information
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Prisma error code: ${error.code}, message: ${error.message}`);
      
      // Handle specific Prisma errors
      if (error.code === 'P2002') {
        return res.status(409).json({ 
          error: 'Conflict error', 
          message: 'A post with this ID already exists',
          details: error.meta
        });
      }
    }
    
    // For other types of errors, return a more informative response
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
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