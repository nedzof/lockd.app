import { DynamicTagGenerator } from '../services/dynamicTagGenerator.js';
import { logger } from '../utils/logger.js';

async function main() {
  try {
    logger.info('Starting manual tag generation');
    const tagGenerator = new DynamicTagGenerator();
    const tags = await tagGenerator.generateTags();
    logger.info(`Generated ${tags.length} tags: ${tags.join(', ')}`);
  } catch (error) {
    logger.error('Error generating tags:', error);
  } finally {
    process.exit(0);
  }
}

main();
