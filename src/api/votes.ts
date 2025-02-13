import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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
  } catch (error) {
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
  } catch (error) {
    console.error('Error fetching vote:', error);
    res.status(500).json({ error: 'Failed to fetch vote' });
  }
});

export default router; 