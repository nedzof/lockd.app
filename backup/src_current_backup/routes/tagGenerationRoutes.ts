import express from 'express';
import { generateTagsController } from '../controllers/tagGenerationController';

const router = express.Router();

/**
 * @route POST /api/tag-generation
 * @desc Generate tags from provided content
 * @access Private
 */
router.post('/tag-generation', generateTagsController);

export default router;
