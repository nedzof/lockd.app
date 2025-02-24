import { NextApiRequest, NextApiResponse } from 'next';
import { DbClient } from '../../services/dbClient';

const dbClient = new DbClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Log database URL (without credentials)
    const dbUrl = process.env.DATABASE_URL || '';
    console.log('Database host:', dbUrl.split('@')[1]?.split('/')[0]);
    
    console.log('API: Received request for /api/posts');
    console.log('Query params:', req.query);
    console.log('Headers:', req.headers);

    const {
      timeFilter,
      rankingFilter,
      personalFilter,
      blockFilter,
      selectedTags,
      userId
    } = req.query;

    console.log('userId type:', typeof userId, 'value:', userId);

    // Parse selectedTags
    let parsedTags: string[] = [];
    try {
      parsedTags = selectedTags ? JSON.parse(selectedTags as string) : [];
      console.log('Parsed tags:', parsedTags);
    } catch (e) {
      console.error('Failed to parse selectedTags:', e);
      return res.status(400).json({ message: 'Invalid selectedTags format' });
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
      if (rankingFilter === 'top1') {
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
          take: 100
        });

        // Create an array of post IDs in the correct order
        const orderedIds = postsWithCounts.map(p => p.id);
        
        // Add the IDs to the where clause
        where.id = { in: orderedIds };
        // Use the same order for the final query
        orderBy = {
          created_at: 'desc'
        };
      }

      // Apply personal filters
      if (userId) {
        if (userId === 'anon') {
          where.author_address = {
            isNull: true
          };
        } else {
          where.author_address = userId;
        }
      }

      // Apply time filter
      if (timeFilter) {
        console.log('Applying time filter:', timeFilter);
        const now = new Date();
        const timeFilters: { [key: string]: number } = {
          '1d': 1,
          '7d': 7,
          '30d': 30
        };
        const days = timeFilters[timeFilter as string];
        if (days) {
          const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          where.created_at = { gte: startDate };
        }
      }

      // Apply tag filter
      if (parsedTags.length > 0) {
        console.log('Processing selectedTags:', parsedTags);
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
              txid: true,
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
            txid: post.txid,
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
              txid: option.txid,
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