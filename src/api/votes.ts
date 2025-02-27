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
    const txid = req.params.txid;
    console.log(`[API] Fetching vote options for txid: ${txid}`);
    
    // First find the post by txid
    const post = await prisma.post.findUnique({
      where: {
        txid: txid
      }
    });

    console.log(`[API] Post found for txid ${txid}:`, post);

    if (!post) {
      console.log(`[API] Post not found for txid: ${txid}`);
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if this is a vote post
    if (!post.is_vote && (!post.metadata || post.metadata.content_type !== 'vote')) {
      console.log(`[API] Post ${txid} is not a vote post. is_vote=${post.is_vote}, metadata=${JSON.stringify(post.metadata)}`);
      
      // If it's not marked as a vote post but should be, update it
      if (post.metadata && (post.metadata.voteOptions || post.metadata.content_type === 'vote' || post.metadata.isVote)) {
        console.log(`[API] Updating post ${txid} to mark it as a vote post`);
        await prisma.post.update({
          where: { id: post.id },
          data: { 
            is_vote: true,
            metadata: {
              ...post.metadata,
              content_type: 'vote',
              isVote: true
            }
          }
        });
      } else {
        return res.status(404).json({ error: 'Not a vote post' });
      }
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

    console.log(`[API] Vote options found for post ${post.id}:`, voteOptions);

    // If no vote options found, create default ones
    if (voteOptions.length === 0) {
      console.log(`[API] No vote options found for post ${post.id}, creating default options`);
      
      const defaultOptions = ['Yes', 'No', 'Maybe'];
      const createdOptions = [];
      
      for (let i = 0; i < defaultOptions.length; i++) {
        const optionTxid = `${post.txid}-option-${i}`;
        const newOption = await prisma.voteOption.create({
          data: {
            txid: optionTxid,
            content: defaultOptions[i],
            post_id: post.id,
            author_address: post.author_address || '',
            lock_duration: 1000,
            created_at: new Date()
          },
          include: {
            lock_likes: true
          }
        });
        createdOptions.push(newOption);
      }
      
      // Calculate total locked amount for each option
      const voteOptionsWithTotals = createdOptions.map(option => {
        return {
          ...option,
          total_locked: 0,
          lock_likes: undefined // Don't expose the individual lock likes
        };
      });
      
      console.log(`[API] Created default vote options for post ${post.id}:`, voteOptionsWithTotals);
      
      // Update the post to ensure it's marked as a vote post
      await prisma.post.update({
        where: { id: post.id },
        data: { 
          is_vote: true,
          metadata: {
            ...post.metadata,
            content_type: 'vote',
            isVote: true
          }
        }
      });
      
      return res.json(voteOptionsWithTotals);
    }

    // Calculate total locked amount for each option
    const voteOptionsWithTotals = voteOptions.map(option => {
      const totalLocked = option.lock_likes.reduce((sum, lock) => sum + lock.amount, 0);
      return {
        ...option,
        total_locked: totalLocked,
        lock_likes: undefined // Don't expose the individual lock likes
      };
    });

    console.log(`[API] Vote options with totals for post ${post.id}:`, voteOptionsWithTotals);
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