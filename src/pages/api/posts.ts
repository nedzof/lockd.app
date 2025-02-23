import { NextApiRequest, NextApiResponse } from 'next';
import { DbClient } from '../../services/dbClient';

const dbClient = new DbClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const {
      timeFilter,
      rankingFilter,
      personalFilter,
      blockFilter,
      selectedTags,
      userId
    } = req.query;

    // Build the base query
    let where: any = {};

    // Apply time filter
    if (timeFilter) {
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

    // Apply tag filter if selectedTags is a string (from query params)
    if (selectedTags) {
      try {
        const parsedTags = JSON.parse(selectedTags as string);
        if (Array.isArray(parsedTags) && parsedTags.length > 0) {
          where.tags = { hasEvery: parsedTags };
        }
      } catch (e) {
        console.warn('Failed to parse selectedTags:', e);
      }
    }

    // Apply personal filters
    if (personalFilter === 'mylocks' && userId) {
      where.author_address = userId;
    }

    // Get the posts using DbClient
    const posts = await dbClient.prisma.post.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        vote_options: true // Include vote options if any
      }
    });

    // Process and return posts
    res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
}