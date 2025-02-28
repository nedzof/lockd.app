import prisma from '../db/prisma';
import { logger } from '../utils/logger';
import { TagDatabaseService } from '../services/tagDatabaseService';
import fs from 'fs';
import path from 'path';

const tagService = new TagDatabaseService();

/**
 * Script to tag existing posts in the database
 * This can be run as a one-time operation to ensure all posts have tags
 */
async function tagExistingPosts() {
  logger.info('Starting to tag existing posts');
  
  try {
    // Create results directory
    const resultsDir = path.join(process.cwd(), 'data/tag-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Get posts without tags or with few tags
    const posts = await prisma.post.findMany({
      where: {
        OR: [
          { tags: { isEmpty: true } },
        ]
      },
      orderBy: {
        created_at: 'desc'  // Using snake_case for Prisma query to match the field name in the schema
      },
      select: {
        id: true,
        content: true,
        tags: true
      }
    });
    
    // Filter posts with few tags in memory
    const filteredPosts = posts.filter(post => post.tags.length === 0 || post.tags.length <= 5);
    
    logger.info(`Found ${filteredPosts.length} posts that need tags`);
    
    if (filteredPosts.length === 0) {
      logger.info('No posts found that need tags');
      return;
    }
    
    // Process posts in batches to avoid overloading the system
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < filteredPosts.length; i += batchSize) {
      const batch = filteredPosts.slice(i, i + batchSize);
      logger.info(`Processing batch ${i / batchSize + 1} of ${Math.ceil(filteredPosts.length / batchSize)}`);
      
      for (const post of batch) {
        const startTime = Date.now();
        
        // Skip posts with very short content
        if (post.content.length < 20) {
          logger.info(`Skipping post ${post.id} due to short content (${post.content.length} chars)`);
          results.push({
            post_id: post.id,
            status: 'skipped',
            reason: 'Content too short',
            previousTags: post.tags,
            newTags: [],
            executionTimeMs: 0
          });
          continue;
        }
        
        // Generate and apply tags
        const tags = await tagService.applyTagsToPost(post.id, post.content);
        const endTime = Date.now();
        
        results.push({
          post_id: post.id,
          status: 'tagged',
          previousTags: post.tags,
          newTags: tags,
          tagCount: tags.length,
          executionTimeMs: endTime - startTime
        });
        
        logger.info(`Tagged post ${post.id} with ${tags.length} tags in ${endTime - startTime}ms`);
      }
      
      // Small delay between batches
      if (i + batchSize < filteredPosts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update tag statistics
    await tagService.updateTagStatistics();
    
    // Write results to file
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    fs.writeFileSync(
      path.join(resultsDir, `tag-results-${timestamp}.json`),
      JSON.stringify({
        timestamp,
        total_posts: filteredPosts.length,
        processedPosts: results.length,
        results
      }, null, 2)
    );
    
    logger.info(`Tagging completed for ${results.length} posts. Results saved to data/tag-results/`);
  } catch (error) {
    logger.error('Error tagging existing posts:', error);
  }
}

// Run the script
tagExistingPosts()
  .then(() => {
    logger.info('Post tagging script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Post tagging script failed:', error);
    process.exit(1);
  });
