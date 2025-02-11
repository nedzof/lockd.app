import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Default tags if none are found in the database
const DEFAULT_TAGS = [
  'Politics',
  'Crypto',
  'Sports',
  'Pop Culture',
  'Business',
  'Tech',
  'Current Events',
  'Finance',
  'Health',
  'Memes'
];

router.get('/', async (req, res) => {
  try {
    // Get unique tags from posts
    const posts = await prisma.post.findMany({
      select: {
        tags: true
      }
    });

    // Extract unique tags
    const uniqueTags = new Set<string>();
    posts.forEach(post => {
      post.tags.forEach(tag => uniqueTags.add(tag));
    });

    // If no tags found in posts, return default tags
    const tags = uniqueTags.size > 0 ? Array.from(uniqueTags) : DEFAULT_TAGS;

    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Error fetching tags' });
  }
});

export default router; 