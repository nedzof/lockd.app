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
  authorAddress: string;
  mediaType?: string;
  rawImageData?: string | null;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  isLocked?: boolean;
  lockDuration?: number;
  isVote?: boolean;
  voteOptions?: Array<{
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
  authorAddress: string;
  rawImageData?: string | null;
  mediaType?: string | null;
  description?: string;
  tags?: string[];
  predictionMarketData?: any;
  isLocked: boolean;
  lockDuration?: number;
  lockAmount?: number;
  createdAt: string;
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
  authorAddress: string;
  createdAt: Date;
  tags: string[];
  mediaType?: string | null;
  rawImageData?: Buffer | null;
}

interface VoteOptionResponse {
  id: string;
  txid: string;
  content: string;
  authorAddress: string | null;
  createdAt: Date;
  lockAmount: number;
  lockDuration: number;
  unlockHeight: number | null;
  tags: string[];
  postId: string;
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
        { createdAt: 'desc' },
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
        voteOptions: true,
        lockLikes: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    // VALIDATION: Log the IDs of posts we found to check for duplicates
    logger.debug('Found posts', {
      count: posts.length,
      requestedLimit: parsedLimit,
      postIds: posts.map(post => post.id)
    });

    // Check if there are more items
    const hasMore = posts.length > parsedLimit;
    
    // Remove the extra item if we fetched more than requested
    const postsToReturn = hasMore ? posts.slice(0, parsedLimit) : posts;

    // VALIDATION: Log the IDs of posts we're returning
    logger.debug('Posts to return', {
      count: postsToReturn.length,
      postIds: postsToReturn.map(post => post.id)
    });

    // Process posts to handle rawImageData
    const processedPosts = postsToReturn.map(post => {
      // Process rawImageData to ensure it's in the correct format for the frontend
      if (post.rawImageData) {
        try {
          // Convert Bytes to base64 string for frontend use
          post.rawImageData = Buffer.from(post.rawImageData).toString('base64');
          logger.debug('Converted rawImageData from Bytes to base64 string', {
            postId: post.id,
            dataLength: post.rawImageData.length
          });
        } catch (e) {
          logger.error('Error processing rawImageData', {
            error: e instanceof Error ? e.message : 'Unknown error',
            postId: post.id
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
        voteOptions: true
      }
    });

    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    // Process rawImageData to ensure it's in the correct format for the frontend
    if (post.rawImageData) {
      try {
        // Convert Bytes to base64 string for frontend use
        post.rawImageData = Buffer.from(post.rawImageData).toString('base64');
        logger.debug('Converted rawImageData from Bytes to base64 string', {
          postId: post.id,
          dataLength: post.rawImageData.length
        });
      } catch (e) {
        logger.error('Error processing rawImageData', {
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
        mediaType: true,
        rawImageData: true,
        imageFormat: true
      }
    });

    if (!post || !post.rawImageData) {
      res.status(404).json({ message: 'Media not found' });
      return;
    }

    // Map of content types for different formats
    const contentTypeMap: Record<string, string> = {
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
    let contentType = post.mediaType;
    
    // If we have an imageFormat but no mediaType, try to determine from format
    if (!contentType && post.imageFormat && contentTypeMap[post.imageFormat.toLowerCase()]) {
      contentType = contentTypeMap[post.imageFormat.toLowerCase()];
    }
    
    // Default to octet-stream if we can't determine the type
    if (!contentType) {
      contentType = 'application/octet-stream';
    }

    // Set appropriate content type
    res.setHeader('Content-Type', contentType);

    // Add cache control headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('ETag', `"${req.params.id}"`);

    // Log information about the image data
    logger.debug('Sending image data', {
      postId: req.params.id,
      mediaType: contentType,
      dataType: typeof post.rawImageData,
      isBuffer: Buffer.isBuffer(post.rawImageData),
      dataLength: post.rawImageData.length
    });

    // Send the raw image data - it's already a Buffer in the database
    res.send(post.rawImageData);
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
      authorAddress,
      tags = [],
      isVote = false,
      voteOptions = [],
      rawImageData,
      mediaType,
      txid,
      postId: clientProvidedPostId // Extract postId if client provides it
    } = req.body;

    // Validate required fields
    if (!content && !rawImageData) {
      console.error('Missing required fields: content or rawImageData');
      return res.status(400).json({ error: 'Content or image is required' });
    }

    if (!authorAddress) {
      console.error('Missing required field: authorAddress');
      return res.status(400).json({ error: 'Author address is required' });
    }

    // Validate image format if provided
    if (rawImageData && mediaType) {
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
      
      if (!supportedFormats.includes(mediaType)) {
        console.error('Unsupported image format:', mediaType);
        return res.status(400).json({ 
          error: 'Unsupported image format. Please use JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF.' 
        });
      }
    }

    // Validate vote options if this is a vote post
    if (isVote && (!voteOptions || voteOptions.length < 2)) {
      console.error('Invalid vote options:', voteOptions);
      return res.status(400).json({ error: 'Vote posts require at least 2 valid options' });
    }

    // Generate temporary transaction ID if not provided
    const tempTxid = txid || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`Creating post with ID: ${tempTxid}, clientProvidedPostId: ${clientProvidedPostId}`);
    
    // Create a minimal post with required fields
    try {
      const post = await prisma.post.create({
        data: {
          id: tempTxid,
          txid: tempTxid,
          content: content,
          authorAddress: authorAddress,
          tags: tags || [],
          isVote: isVote || false,
          metadata: clientProvidedPostId ? { postId: clientProvidedPostId } : undefined
        }
      });

      // If we succeeded with minimal data, now try to update with image if provided
      if (rawImageData) {
        try {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              rawImageData: rawImageData ? Buffer.from(rawImageData, 'base64') : null,
              mediaType: mediaType || null
            }
          });
        } catch (imageError) {
          console.error('Error updating post with image data:', imageError);
          // We'll continue since the post was already created
        }
      }

      console.log('Post created successfully:', post);

      // If this is a vote post, create vote options
      if (isVote && voteOptions && voteOptions.length >= 2) {
        // Create vote options
        const voteOptionPromises = voteOptions.map(async (option: any, index: number) => {
          const voteOptionId = `vote_option_${tempTxid}_${index}`;
          return prisma.voteOption.create({
            data: {
              id: voteOptionId,
              txid: `${tempTxid}_option_${index}`,
              content: option.text,
              postId: post.id,
              authorAddress: authorAddress,
              optionIndex: index
            }
          });
        });

        await Promise.all(voteOptionPromises);
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
      rawImageData: req.body.rawImageData ? `[Image data length: ${req.body.rawImageData.length}]` : null
    });
    
    // Extract post data from request body
    const {
      postId,
      content,
      authorAddress,
      rawImageData,
      mediaType,
      tags = [],
      isLocked = false,
      lockAmount = 0,
      createdAt = new Date().toISOString()
    } = req.body;

    // Validate required fields
    if (!content && !rawImageData) {
      console.error('Missing required fields: content or rawImageData');
      return res.status(400).json({ error: 'Content or image is required' });
    }

    if (!authorAddress) {
      console.error('Missing required field: authorAddress');
      return res.status(400).json({ error: 'Author address is required' });
    }

    // Validate image format if provided
    if (rawImageData && mediaType) {
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
      
      if (!supportedFormats.includes(mediaType)) {
        console.error('Unsupported image format:', mediaType);
        return res.status(400).json({ 
          error: 'Unsupported image format. Please use JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF.' 
        });
      }
      
      // Log image details for debugging
      console.log('Image upload details:', {
        hasImageData: true,
        imageDataLength: rawImageData.length,
        mediaType: mediaType,
        imageDataPreview: rawImageData.substring(0, 100) + '...'
      });
    }

    // Create temporary txid for the post
    const tempTxid = `temp_${postId}_${Date.now()}`;
    
    // Prepare metadata for scanner processing
    const metadata = {
      predictionMarketData,
      app: 'lockd',
      version: '1.0.0',
      lock: {
        isLocked,
        amount: lockAmount
      },
      // Add scanner-related metadata
      scanner: {
        status: 'pending',
        processedAt: null
      }
    };

    const postData = {
      id: tempTxid,
      txid: tempTxid,
      content,
      authorAddress,
      rawImageData: rawImageData || null,
      mediaType: mediaType || null,
      tags,
      metadata,
      isLocked,
      createdAt: new Date(createdAt),
      blockHeight: null
    } as const;

    const post = await prisma.post.create({
      data: {
        id: postData.id,
        txid: postData.txid,
        content: postData.content,
        authorAddress: postData.authorAddress,
        rawImageData: postData.rawImageData ? Buffer.from(postData.rawImageData) : null,
        mediaType: postData.mediaType,
        tags: postData.tags,
        metadata: postData.metadata,
        isLocked: postData.isLocked,
        createdAt: postData.createdAt,
        blockHeight: postData.blockHeight
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