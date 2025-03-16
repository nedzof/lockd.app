import express from 'express';
import { 
  generateTagsForPost, 
  generateTagsForRecentPosts,
  getPopularTags,
  generateTagsFromContent
} from '../controllers/postTaggingController';

const router = express.Router();

/**
 * @route POST /api/post-tagging/:post_id
 * @desc Generate tags for a specific post
 * @access Private
 */
router.post('/post-tagging/:post_id', generateTagsForPost);

/**
 * @route POST /api/post-tagging/generate
 * @desc Generate tags from arbitrary content
 * @access Private
 */
router.post('/post-tagging/generate', generateTagsFromContent);

/**
 * @route POST /api/post-tagging/batch/recent
 * @desc Generate tags for recent posts without tags
 * @access Private
 */
router.post('/post-tagging/batch/recent', generateTagsForRecentPosts);

/**
 * @route GET /api/post-tagging/popular
 * @desc Get popular tags with usage statistics
 * @access Public
 */
router.get('/post-tagging/popular', getPopularTags);

export default router;
