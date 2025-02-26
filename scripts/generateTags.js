#!/usr/bin/env node

/**
 * Script to manually generate tags
 * Run with: npm run generate-tags
 */

import { runTagGenerationJob } from '../src/jobs/tagGenerationJob.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  try {
    logger.info('Starting manual tag generation script');
    const tags = await runTagGenerationJob();
    logger.info(`Generated ${tags.length} tags successfully`);
    
    // Log the generated tags
    if (tags.length > 0) {
      logger.info('Generated tags:', tags);
    } else {
      logger.warn('No tags were generated');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Error generating tags:', error);
    process.exit(1);
  }
}

main();
