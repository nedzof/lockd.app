import { Request, Response } from 'express';
import { LocalDeepseekService } from '../services/localDeepseekService';
import { logger } from '../utils/logger';

/**
 * Controller for tag generation
 * @param req Express request object
 * @param res Express response object
 */
export const generateTagsController = async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    // Validate input
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Content is required and must be a string',
      });
    }

    if (content.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Content must be at least 10 characters long',
      });
    }

    // Initialize the DeepSeek service
    const deepseekService = new LocalDeepseekService();
    
    // Generate tags
    logger.info(`Generating tags for content (${content.length} characters)`);
    const tags = await deepseekService.generateTags(content);
    
    // Return the generated tags
    return res.status(200).json({
      success: true,
      data: {
        tags,
        count: tags.length,
        mode: deepseekService.isUsingFallback() ? 'fallback' : 'ai',
      },
    });
  } catch (error) {
    logger.error('Error generating tags:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate tags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
