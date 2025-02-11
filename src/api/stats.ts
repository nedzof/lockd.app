import express from 'express';
import { PrismaClient, Post } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    // Get all posts ordered by creation date
    const posts = await prisma.post.findMany({
      orderBy: {
        created_at: 'asc'
      }
    });

    // Process posts to create time series data
    const timeSeriesData = posts.reduce((acc: { timestamps: string[], amounts: number[] }, post: Post) => {
      const timestamp = post.created_at.toISOString().split('T')[0];
      const amount = Number(post.amount) || 0;
      const totalAmount = amount / 100000000; // Convert to BSV

      const existingIndex = acc.timestamps.indexOf(timestamp);
      if (existingIndex !== -1) {
        acc.amounts[existingIndex] += totalAmount;
      } else {
        acc.timestamps.push(timestamp);
        acc.amounts.push(totalAmount);
      }

      return acc;
    }, { timestamps: [], amounts: [] });

    res.json(timeSeriesData);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router; 