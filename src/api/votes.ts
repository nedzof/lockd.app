import express, { Request, Response } from 'express';
import prisma from '../db';
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

// Get vote options for a specific post by post tx_id
router.get('/:tx_id/options', async (req: Request, res: Response) => {
  try {
    const tx_id = req.params.tx_id;
    console.log(`[API] Fetching vote options for tx_id: ${tx_id}`);
    
    // First find the post by tx_id
    const post = await prisma.post.findUnique({
      where: {
        tx_id: tx_id
      }
    });

    console.log(`[API] Post found for tx_id ${tx_id}:`, post);

    if (!post) {
      console.log(`[API] Post not found for tx_id: ${tx_id}`);
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if this is a vote post
    if (!post.is_vote && (!post.metadata || post.metadata.content_type !== 'vote')) {
      console.log(`[API] Post ${tx_id} is not a vote post. is_vote=${post.is_vote}, metadata=${JSON.stringify(post.metadata)}`);
      
      // If it's not marked as a vote post but should be, update it
      if (post.metadata && (post.metadata.vote_options || post.metadata.content_type === 'vote' || post.metadata.is_vote)) {
        console.log(`[API] Updating post ${tx_id} to mark it as a vote post`);
        await prisma.post.update({
          where: { id: post.id },
          data: { 
            is_vote: true,
            metadata: {
              ...post.metadata,
              content_type: 'vote',
              is_vote: true
            }
          }
        });
      } else {
        return res.status(404).json({ error: 'Not a vote post' });
      }
    }

    // Get the vote options with their total locked amounts
    const vote_options = await prisma.vote_option.findMany({
      where: {
        post_id: post.id
      },
      include: {
        lock_likes: true
      }
    });

    console.log(`[API] Vote options found for post ${post.id}:`, vote_options);

    // If no vote options found, create default ones
    if (vote_options.length === 0) {
      console.log(`[API] No vote options found for post ${post.id}, creating default options`);
      
      const defaultOptions = ['Yes', 'No', 'Maybe'];
      const createdOptions = [];
      
      for (let i = 0; i < defaultOptions.length; i++) {
        const optiontx_id = `${post.tx_id}-option-${i}`;
        const newOption = await prisma.vote_option.create({
          data: {
            tx_id: optiontx_id,
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
      const vote_optionsWithTotals = createdOptions.map(option => {
        return {
          ...option,
          total_locked: 0,
          lock_likes: undefined // Don't expose the individual lock likes
        };
      });
      
      console.log(`[API] Created default vote options for post ${post.id}:`, vote_optionsWithTotals);
      
      // Update the post to ensure it's marked as a vote post
      await prisma.post.update({
        where: { id: post.id },
        data: { 
          is_vote: true,
          metadata: {
            ...post.metadata,
            content_type: 'vote',
            is_vote: true
          }
        }
      });
      
      return res.json(vote_optionsWithTotals);
    }

    // Calculate total locked amount for each option
    const vote_optionsWithTotals = vote_options.map(option => {
      const totalLocked = option.lock_likes.reduce((sum, lock) => {
        // Log each lock amount for debugging
        logger.debug(`Lock for option ${option.id}: amount=${lock.amount}, tx_id=${lock.tx_id}`);
        
        // Make sure the amount is treated as a number
        const lockAmount = Number(lock.amount);
        if (isNaN(lockAmount)) {
          logger.warn(`Invalid lock amount for tx_id ${lock.tx_id}: ${lock.amount}`);
          return sum;
        }
        
        return sum + lockAmount;
      }, 0);
      
      logger.info(`Vote option ${option.id} (${option.content}): total locked = ${totalLocked} satoshis from ${option.lock_likes.length} locks`);
      
      return {
        ...option,
        total_locked: totalLocked,
        lock_likes: undefined // Don't expose the individual lock likes
      };
    });

    // Calculate and log the overall total locked for this vote
    const overallTotalLocked = vote_optionsWithTotals.reduce((sum, option) => sum + option.total_locked, 0);
    logger.info(`Total locked amount across all options for post ${post.id}: ${overallTotalLocked} satoshis`);

    // Log a detailed breakdown
    logger.info(`Detailed vote stats for post ${post.id}:`);
    vote_optionsWithTotals.forEach(option => {
      const percentage = overallTotalLocked > 0 
        ? ((option.total_locked / overallTotalLocked) * 100).toFixed(2) 
        : '0.00';
      logger.info(`- Option "${option.content}": ${option.total_locked} satoshis (${percentage}%)`);
    });

    console.log(`[API] Vote options with totals for post ${post.id}:`, vote_optionsWithTotals);
    res.json(vote_optionsWithTotals);
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

// Get total locked amount for a specific vote option
router.get('/option/:option_id/total-locked', async (req: Request, res: Response) => {
  try {
    const option_id = req.params.option_id;
    logger.info(`Fetching total locked amount for vote option: ${option_id}`);
    
    // Get the vote option with its lock likes
    const vote_option = await prisma.vote_option.findUnique({
      where: {
        id: option_id
      },
      include: {
        lock_likes: true
      }
    });

    if (!vote_option) {
      logger.warn(`Vote option not found: ${option_id}`);
      return res.status(404).json({ error: 'Vote option not found' });
    }

    // Calculate total locked amount
    const totalLocked = vote_option.lock_likes.reduce((sum, lock) => sum + lock.amount, 0);
    
    logger.info(`Total locked amount for vote option ${option_id}: ${totalLocked}`);
    
    res.json({ 
      id: vote_option.id,
      total_locked: totalLocked 
    });
  } catch (error: any) {
    logger.error('Error fetching vote option total locked amount', {
      error: error.message,
      code: error.code
    });

    res.status(500).json({ error: 'Failed to fetch vote option total locked amount' });
  }
});

export default router; 