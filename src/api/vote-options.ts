import express, { Request, Response } from 'express';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

const router = express.Router();

// Get vote options for a specific post by post txid
router.get('/:txid', async (req: Request, res: Response) => {
  try {
    const txid = req.params.txid;
    logger.debug(`Fetching vote options for txid: ${txid}`);
    
    // First find the post by txid
    const post = await prisma.post.findUnique({
      where: {
        txid: txid
      }
    });

    logger.debug(`Post found for txid ${txid}:`, post);

    if (!post) {
      logger.debug(`Post not found for txid: ${txid}`);
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if this is a vote post
    if (!post.is_vote && (!post.metadata || post.metadata.contentType !== 'vote')) {
      logger.debug(`Post ${txid} is not a vote post. is_vote=${post.is_vote}, metadata=${JSON.stringify(post.metadata)}`);
      
      // If it's not marked as a vote post but should be, update it
      if (post.metadata && (post.metadata.voteOptions || post.metadata.contentType === 'vote' || post.metadata.isVote)) {
        logger.debug(`Updating post ${txid} to mark it as a vote post`);
        await prisma.post.update({
          where: { id: post.id },
          data: { 
            is_vote: true,
            metadata: {
              ...post.metadata,
              contentType: 'vote',
              is_vote: true
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
        lockLikes: true
      }
    });

    logger.debug(`Vote options found for post ${post.id}:`, voteOptions);

    // If no vote options found, create default ones
    if (voteOptions.length === 0) {
      logger.debug(`No vote options found for post ${post.id}, creating default options`);
      
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
            lockLikes: true
          }
        });
        createdOptions.push(newOption);
      }
      
      // Calculate total locked amount for each option
      const voteOptionsWithTotals = createdOptions.map(option => {
        return {
          ...option,
          totalLocked: 0,
          lockLikes: undefined // Don't expose the individual lock likes
        };
      });
      
      logger.debug(`Created default vote options for post ${post.id}:`, voteOptionsWithTotals);
      
      // Update the post to ensure it's marked as a vote post
      await prisma.post.update({
        where: { id: post.id },
        data: { 
          is_vote: true,
          metadata: {
            ...post.metadata,
            contentType: 'vote',
            is_vote: true
          }
        }
      });
      
      return res.json(voteOptionsWithTotals);
    }

    // Calculate total locked amount for each option
    const voteOptionsWithTotals = voteOptions.map(option => {
      const totalLocked = option.lockLikes.reduce((sum, lock) => sum + lock.amount, 0);
      return {
        ...option,
        totalLocked: totalLocked,
        lockLikes: undefined // Don't expose the individual lock likes
      };
    });

    logger.debug(`Vote options with totals for post ${post.id}:`, voteOptionsWithTotals);
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

    logger.error('Error fetching vote options:', error);
    res.status(500).json({ error: 'Failed to fetch vote options' });
  }
});

export default router;
