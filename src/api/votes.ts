import express, { Request, Response } from 'express';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

const router = express.Router();

// Get all vote questions with their options
router.get('/', async (req: Request, res: Response) => {
  try {
    const voteQuestions = await prisma.post.findMany({
      where: {
        is_vote: true
      },
      include: {
        vote_options: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(voteQuestions);
  } catch (error: any) {
    logger.error('Error fetching votes', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    console.error('Error fetching votes:', error);
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

// Get a specific vote question by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const voteQuestion = await prisma.post.findUnique({
      where: {
        id: req.params.id,
        is_vote: true
      },
      include: {
        vote_options: true
      }
    });

    if (!voteQuestion) {
      return res.status(404).json({ error: 'Vote question not found' });
    }

    res.json(voteQuestion);
  } catch (error: any) {
    logger.error('Error fetching vote', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    console.error('Error fetching vote:', error);
    res.status(500).json({ error: 'Failed to fetch vote' });
  }
});

// Get vote options for a specific post by post txid
router.get('/:txid/options', async (req: Request, res: Response) => {
  try {
    // First find the post by txid
    const post = await prisma.post.findUnique({
      where: {
        txid: req.params.txid
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Get the vote options with their total locked amounts
    const voteOptions = await prisma.voteOption.findMany({
      where: {
        post_id: post.id
      },
      include: {
        lock_likes: true
      }
    });

    // Calculate total locked amount for each option
    const voteOptionsWithTotals = voteOptions.map(option => {
      const totalLocked = option.lock_likes.reduce((sum, lock) => sum + lock.amount, 0);
      return {
        ...option,
        total_locked: totalLocked,
        lock_likes: undefined // Don't expose the individual lock likes
      };
    });

    res.json(voteOptionsWithTotals);
  } catch (error: any) {
    logger.error('Error fetching vote options', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    console.error('Error fetching vote options:', error);
    res.status(500).json({ error: 'Failed to fetch vote options' });
  }
});

export default router; 