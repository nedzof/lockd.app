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
    console.log('Tags API - Database host:', dbUrl.split('@')[1]?.split('/')[0]);
    
    console.log('API: Received request for /api/tags');
    console.log('Headers:', req.headers);

    // Check database connection with timeout
    try {
      console.log('Tags API - Testing database connection...');
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      );
      const dbCheck = dbClient.prisma.$queryRaw`SELECT current_database(), current_schema()`;
      const [dbInfo] = await Promise.race([timeout, dbCheck]);
      console.log('Tags API - Database connection successful:', dbInfo);
    } catch (e) {
      console.error('Tags API - Database connection check failed:', e);
      return res.status(500).json({ 
        message: 'Database connection failed',
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    console.log('Tags API - Starting tag query...');
    // Get all unique tags and their counts using a more efficient query
    const tagCounts = await dbClient.prisma.$queryRaw`
      WITH RECURSIVE tag_counts AS (
        SELECT unnest(tags) as tag, count(*) as count
        FROM "Post"
        WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
        GROUP BY tag
      ),
      tag_locks AS (
        SELECT p.tags[1] as tag, COALESCE(SUM(l.amount), 0) as total_locked
        FROM "Post" p
        LEFT JOIN "LockLike" l ON l.post_id = p.id
        WHERE p.tags IS NOT NULL AND array_length(p.tags, 1) > 0
        GROUP BY p.tags[1]
      )
      SELECT 
        tc.tag,
        tc.count::integer as count,
        COALESCE(tl.total_locked, 0)::integer as total_locked
      FROM tag_counts tc
      LEFT JOIN tag_locks tl ON tl.tag = tc.tag
      WHERE tc.tag IS NOT NULL
      ORDER BY tc.count DESC, tc.tag ASC
    `;

    console.log('Tags API - Query completed. Found tags:', tagCounts.length);
    console.log('Tags API - First few tags:', tagCounts.slice(0, 3));

    res.status(200).json({ tags: tagCounts });
  } catch (error) {
    console.error('Error in /api/tags:', error);
    res.status(500).json({ 
      message: 'Failed to fetch tags', 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
}
