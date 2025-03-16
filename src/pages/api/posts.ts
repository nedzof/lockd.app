import { NextApiRequest, NextApiResponse } from 'next';
import { DbClient } from '../../services/dbClient';

const dbClient = new DbClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check method and route to appropriate handler
  if (req.method === 'GET') {
    return handleGetPosts(req, res);
  } else if (req.method === 'POST') {
    return handleCreatePost(req, res);
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

async function handleGetPosts(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Log database URL (without credentials)
    const dbUrl = process.env.DATABASE_URL || '';
    console.log('Database host:', dbUrl.split('@')[1]?.split('/')[0]);
    
    console.log('API: Received request for /api/posts');
    console.log('Query params:', req.query);
    console.log('Headers:', req.headers);

    const {
      time_filter,
      ranking_filter,
      personal_filter,
      block_filter,
      selected_tags,
      user_id
    } = req.query;

    console.log('user_id type:', typeof user_id, 'value:', user_id);

    // Parse selected_tags
    let parsedTags: string[] = [];
    try {
      parsedTags = selected_tags ? JSON.parse(selected_tags as string) : [];
      console.log('Parsed tags:', parsedTags);
    } catch (e) {
      console.error('Failed to parse selected_tags:', e);
      return res.status(400).json({ message: 'Invalid selected_tags format' });
    }

    // Check database connection with timeout
    try {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      );
      const dbCheck = dbClient.prisma.$queryRaw`SELECT 1`;
      await Promise.race([timeout, dbCheck]);
      console.log('Database connection successful');
    } catch (e) {
      console.error('Database connection check failed:', e);
      return res.status(500).json({ 
        message: 'Database connection failed',
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    console.log('Fetching posts with query params:', req.query);

    // Build the base query
    let where: any = {};
    let orderBy: any = { created_at: 'desc' };

    try {
      // Apply ranking filter
      if (ranking_filter) {
        console.log('Applying ranking filter:', ranking_filter);
        
        // Determine the number of top posts to fetch
        let topCount = 1; // Default to 1
        
        if (ranking_filter === 'top-1' || ranking_filter === 'top1') {
          topCount = 1;
        } else if (ranking_filter === 'top-3' || ranking_filter === 'top3') {
          topCount = 3;
        } else if (ranking_filter === 'top-10' || ranking_filter === 'top10') {
          topCount = 10;
        }
        
        console.log('Using top count:', topCount);
        
        // First get posts with their lock_like counts
        const postsWithCounts = await dbClient.prisma.post.findMany({
          select: {
            id: true,
            _count: {
              select: {
                lock_likes: true
              }
            }
          },
          orderBy: {
            lock_likes: {
              _count: 'desc'
            }
          },
          take: Math.max(topCount * 10, 100) // Get enough posts to filter from
        });

        // Create an array of post IDs in the correct order
        const orderedIds = postsWithCounts.map(p => p.id).slice(0, topCount);
        
        console.log(`Selected top ${topCount} posts with IDs:`, orderedIds);
        
        // Add the IDs to the where clause
        where.id = { in: orderedIds };
        // Use the same order for the final query
        orderBy = {
          created_at: 'desc'
        };
      }

      // Apply personal filters
      if (personal_filter) {
        console.log('Applying personal filter:', personal_filter);
        
        if (personal_filter === 'mylocks' && user_id) {
          // Show only posts created by the current user
          where.author_address = user_id;
          console.log(`Filtering posts by author: ${user_id}`);
        } else if (personal_filter === 'locked') {
          // Show only posts that have lock_likes
          where.lock_likes = {
            some: {} // At least one lock_like
          };
          console.log('Filtering posts with lock_likes');
        }
      } else if (user_id && !personal_filter) {
        // If no personal filter but user_id is provided, filter by that user
        if (user_id === 'anon') {
          where.author_address = {
            isNull: true
          };
        } else {
          where.author_address = user_id;
        }
      }

      // Apply time filter
      if (time_filter) {
        console.log('Applying time filter:', time_filter);
        const now = new Date();
        const time_filters: { [key: string]: number } = {
          '1d': 1,
          '7d': 7,
          '30d': 30
        };
        const days = time_filters[time_filter as string];
        if (days) {
          const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          where.created_at = { gte: startDate };
        }
      }

      // Apply block filter
      if (block_filter) {
        console.log('Applying block filter:', block_filter);
        
        // Determine the number of blocks to look back
        let blockCount = 1; // Default to 1
        
        if (block_filter === 'last-block') {
          blockCount = 1;
        } else if (block_filter === 'last-5-blocks') {
          blockCount = 5;
        } else if (block_filter === 'last-10-blocks') {
          blockCount = 10;
        }
        
        console.log('Looking back', blockCount, 'blocks');
        
        // Get the current block height
        const currentblock_height = await dbClient.getCurrentblock_height();
        if (currentblock_height) {
          const minblock_height = currentblock_height - blockCount;
          
          // Find posts created in the last N blocks
          where.created_block_height = { 
            gte: minblock_height 
          };
          
          console.log(`Filtering posts with block height >= ${minblock_height} (current: ${currentblock_height})`);
        } else {
          console.error('Failed to get current block height');
        }
      }

      // Apply tag filter
      if (parsedTags.length > 0) {
        console.log('Processing selected_tags:', parsedTags);
        where.tags = { hasEvery: parsedTags };
      }

      console.log('Final where clause:', where);
      console.log('Final orderBy:', orderBy);

      // Get the posts using DbClient
      const posts = await dbClient.prisma.post.findMany({
        where,
        orderBy,
        include: {
          vote_options: true,
          lock_likes: {
            select: {
              id: true,
              tx_id: true,
              author_address: true,
              amount: true,
              lock_duration: true,
              unlock_height: true,
              created_at: true
            }
          }
        }
      });

      // Calculate stats
      const totalLocked = posts.reduce((sum, post) => {
        const postLocks = post.lock_likes?.reduce((lockSum, lock) => lockSum + (lock.amount || 0), 0) || 0;
        return sum + postLocks;
      }, 0);

      const uniqueParticipants = new Set(
        posts.flatMap(post => [
          post.author_address,
          ...(post.lock_likes?.map(lock => lock.author_address) || [])
        ]).filter(Boolean)
      );

      // Process posts to ensure consistent data structure
      const processedPosts = posts.map(post => {
        try {
          return {
            id: post.id,
            tx_id: post.tx_id,
            content: post.content,
            author_address: post.author_address,
            media_type: post.media_type,
            block_height: post.block_height,
            amount: post.lock_likes?.reduce((sum, lock) => sum + (lock.amount || 0), 0) || 0,
            unlock_height: post.unlock_height,
            description: post.description,
            created_at: post.created_at,
            tags: post.tags || [],
            metadata: post.metadata || {},
            is_locked: post.is_locked || false,
            lock_duration: post.lock_duration || 0,
            raw_image_data: post.raw_image_data ? post.raw_image_data.toString('base64') : null,
            image_format: post.media_type?.split('/')[1] || null,
            is_vote: post.is_vote || false,
            vote_options: post.vote_options?.map(option => ({
              id: option.id,
              tx_id: option.tx_id,
              content: option.content || '',
              author_address: option.author_address || '',
              created_at: option.created_at,
              lock_amount: option.lock_amount || 0,
              lock_duration: option.lock_duration || 0,
              unlock_height: option.unlock_height || 0,
              tags: option.tags || []
            })) || []
          };
        } catch (e) {
          console.error('Error processing post:', post.id, e);
          return null;
        }
      }).filter(Boolean); // Remove any null posts from processing errors

      console.log('Successfully processed posts');

      res.status(200).json({
        posts: processedPosts,
        stats: {
          totalLocked,
          participantCount: uniqueParticipants.size,
          roundNumber: 1
        }
      });
    } catch (error) {
      console.error('Error processing posts:', error);
      res.status(500).json({ 
        message: 'Failed to fetch posts', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } catch (error) {
    console.error('Error in posts API:', error);
    res.status(500).json({ 
      message: 'Error fetching posts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Add this new function to handle POST requests
async function handleCreatePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Received post creation request');
    
    // Extract post data from request body
    const {
      tx_id,
      post_id,
      content,
      author_address,
      tags = [],
      is_vote = false,
      vote_options = [],
      raw_image_data,
      media_type,
      is_locked = false,
      metadata = {}
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

    if (!tx_id) {
      console.error('Missing required field: tx_id');
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Create the post in the database
    const post = await dbClient.prisma.post.create({
      data: {
        tx_id,
        content,
        author_address,
        tags,
        is_vote,
        raw_image_data: raw_image_data ? Buffer.from(raw_image_data, 'base64') : null,
        media_type,
        is_locked,
        metadata: metadata || {}
      }
    });

    // If this is a vote post, create the vote options
    if (is_vote && vote_options && vote_options.length > 0) {
      for (const option of vote_options) {
        await dbClient.prisma.vote_option.create({
          data: {
            tx_id: option.tx_id || `${tx_id}_option_${option.index}`,
            content: option.text,
            author_address,
            post_id: post.id,
            option_index: option.index
          }
        });
      }
    }

    return res.status(201).json(post);
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ message: 'Error creating post', error: error.message });
  }
}