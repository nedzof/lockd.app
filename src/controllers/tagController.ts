import { Request, Response } from 'express';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';
import { DynamicTagGenerator } from '../services/dynamicTagGenerator.js';
import { runTagGenerationJob } from '../jobs/tagGenerationJob.js';

// Create an instance of the tag generator
const tagGenerator = new DynamicTagGenerator();

/**
 * Generate tags from current events
 */
export const generateTags = async (req: Request, res: Response) => {
  try {
    logger.info('Manual tag generation triggered via API');
    const tags = await runTagGenerationJob();
    res.json({ success: true, tags });
  } catch (error: any) {
    logger.error('Error in tag generation endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to generate tags' });
  }
};

/**
 * Get current event tags
 */
export const getCurrentEventTags = async (req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      where: {
        type: 'current_event'
      },
      orderBy: {
        usageCount: 'desc'
      },
      take: 50
    });
    
    logger.info(`Fetched ${tags.length} current event tags`);
    res.json({ success: true, tags });
  } catch (error: any) {
    logger.error('Error fetching current event tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
};

/**
 * Get all tags with their metadata
 */
export const getAllTags = async (req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: [
        { type: 'asc' },
        { usageCount: 'desc' }
      ],
      take: 100
    });
    
    logger.info(`Fetched ${tags.length} tags`);
    res.json({ success: true, tags });
  } catch (error: any) {
    logger.error('Error fetching all tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
};

/**
 * Update a tag
 */
export const updateTag = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Tag name is required' });
  }
  
  try {
    const updatedTag = await prisma.tag.update({
      where: { id },
      data: { 
        name: name.trim(),
        updated_at: new Date()
      }
    });
    
    logger.info(`Updated tag ${id} to "${name}"`);
    res.json({ success: true, tag: updatedTag });
  } catch (error: any) {
    logger.error(`Error updating tag ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to update tag' });
  }
};

/**
 * Delete a tag
 */
export const deleteTag = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    await prisma.tag.delete({
      where: { id }
    });
    
    logger.info(`Deleted tag ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Error deleting tag ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to delete tag' });
  }
};

/**
 * Increment tag usage count
 */
export const incrementTagUsage = async (req: Request, res: Response) => {
  const { name } = req.params;
  
  try {
    const tag = await prisma.tag.findFirst({
      where: { name }
    });
    
    if (tag) {
      await prisma.tag.update({
        where: { id: tag.id },
        data: { 
          usageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });
      
      logger.info(`Incremented usage count for tag "${name}"`);
      res.json({ success: true });
    } else {
      // Create a new tag if it doesn't exist
      const newTag = await prisma.tag.create({
        data: {
          name,
          type: 'user_created',
          usageCount: 1
        }
      });
      
      logger.info(`Created new tag "${name}" with usage count 1`);
      res.json({ success: true, tag: newTag });
    }
  } catch (error: any) {
    logger.error(`Error incrementing usage for tag "${name}":`, error);
    res.status(500).json({ success: false, error: 'Failed to update tag usage' });
  }
};
