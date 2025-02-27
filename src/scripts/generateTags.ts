import { DynamicTagGenerator } from '../services/dynamicTagGenerator.js';
import { logger } from '../utils/logger.js';
import { spawn } from 'child_process';
import path from 'path';

async function updateContentSources() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'dist/scripts/updateContentSources.js');
    const process = spawn('node', [scriptPath]);
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`Content source update failed with code ${code}`));
      }
    });
    
    process.on('error', reject);
  });
}

async function main() {
  try {
    logger.info('Starting manual tag generation');
    
    // First update content sources
    logger.info('Updating content sources');
    await updateContentSources();
    
    // Then generate tags
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
