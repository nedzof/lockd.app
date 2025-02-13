import express, { Request, Response, Router, RequestHandler } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const router: Router = express.Router();
const prisma = new PrismaClient({
  log: ['query', 'error']
});

// Helper function to validate query parameters
const validateQueryParams = (query: any) => {
  const { timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId } = query;
  
  if (timeFilter && !['1d', '7d', '30d'].includes(timeFilter)) {
    throw new Error('Invalid timeFilter value');
  }
  
  if (selectedTags) {
    try {
      const tags = JSON.parse(selectedTags);
      if (!Array.isArray(tags)) {
        throw new Error('selectedTags must be an array');
      }
    } catch (e) {
      throw new Error('Invalid selectedTags format');
    }
  }
};

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
type CreatePostHandler = RequestHandler<{}, any, CreatePostBody, any>;
type CreateDirectPostHandler = RequestHandler<{}, any, DirectPostBody, any>;

const listPosts: PostListHandler = async (req, res, next) => {
  try {
    console.log('Received request for posts with query:', req.query);
    
    // Validate query parameters
    validateQueryParams(req.query);

    const {
      timeFilter,
      rankingFilter,
      personalFilter,
      blockFilter,
      selectedTags,
      userId
    } = req.query;

    // First, find all txids that have vote posts
    const voteTxids = await prisma.post.findMany({
      where: { is_vote: true },
      select: { txid: true }
    });
    const voteTxidSet = new Set(voteTxids.map(p => p.txid));

    // Build the base query - exclude non-vote posts if a vote version exists
    let where: any = {
      AND: [
        {
          OR: [
            { is_vote: true }, // Include all vote posts
            { txid: { notIn: Array.from(voteTxidSet) } } // Include non-vote posts only if no vote version exists
          ]
        }
      ]
    };

    // Apply time filter
    if (timeFilter) {
      const now = new Date();
      const timeFilters: { [key: string]: number } = {
        '1d': 1,
        '7d': 7,
        '30d': 30
      };
      const days = timeFilters[timeFilter];
      if (days) {
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        where.AND.push({ created_at: { gte: startDate } });
      }
    }

    // Apply tag filter
    if (selectedTags) {
      const tags = JSON.parse(selectedTags);
      if (Array.isArray(tags) && tags.length > 0) {
        where.AND.push({ tags: { hasSome: tags } });
      }
    }

    // Apply personal filters
    if (personalFilter === 'mylocks' && userId) {
      where.AND.push({ author_address: userId });
    }

    // Apply block filter if provided
    if (blockFilter) {
      where.AND.push({ block_height: { gte: parseInt(blockFilter, 10) } });
    }

    console.log('Querying posts with where clause:', where);

    // Get the posts with explicit select
    const posts = await prisma.post.findMany({
      where,
      select: {
        id: true,
        txid: true,
        postId: true,
        content: true,
        author_address: true,
        media_type: true,
        block_height: true,
        amount: true,
        unlock_height: true,
        description: true,
        created_at: true,
        tags: true,
        metadata: true,
        is_locked: true,
        lock_duration: true,
        raw_image_data: true,
        image_format: true,
        image_source: true,
        is_vote: true,
        vote_options: {
          select: {
            id: true,
            txid: true,
            content: true,
            lock_amount: true,
            lock_duration: true,
            unlock_height: true,
            current_height: true,
            lock_percentage: true
          }
        }
      },
      orderBy: [
        { created_at: 'desc' }
      ],
      take: 50 // Limit to 50 posts per request for performance
    });

    console.log(`Found ${posts.length} posts`);

    // Process and return posts
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    if (error instanceof Error) {
      res.status(400).json({ 
        message: 'Error fetching posts',
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        message: 'Internal server error while fetching posts'
      });
    }
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