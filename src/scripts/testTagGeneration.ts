import { LocalDeepseekService } from '../services/localDeepseekService';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

async function testTagGeneration() {
  try {
    logger.info('Testing tag generation with LocalDeepseekService');
    
    // Sample content for testing
    const sampleContent = `
Bitcoin reaches new all-time high as institutional adoption increases.
Tech giants announce new AI initiatives at annual developer conference.
Global climate summit concludes with new emissions targets.
Sports league announces expansion teams in three new cities.
Political tensions rise as negotiations stall on key legislation.
Healthcare innovations promise breakthrough treatments for chronic conditions.
Financial markets react to central bank policy announcements.
Entertainment industry adapts to streaming-first distribution models.

Cryptocurrency regulation has become a major focus for governments worldwide.
Artificial intelligence ethics frameworks are being developed by leading tech companies.
Climate change mitigation efforts are accelerating in response to extreme weather events.
Sports league expansion into new markets is driving record revenue growth.
Political polarization continues to impact legislative progress on key issues.
Healthcare innovation is transforming patient care and treatment outcomes.
Financial market volatility has increased due to geopolitical uncertainties.
Streaming media competition has intensified with new platform launches.
    `;
    
    // Initialize the DeepSeek service
    const deepseekService = new LocalDeepseekService();
    
    // Generate tags
    logger.info('Generating tags from sample content...');
    const tags = await deepseekService.generateTags(sampleContent);
    
    // Log the results
    logger.info(`Generated ${tags.length} tags:`);
    logger.info(tags.join(', '));
    
    // Save results to a file for inspection
    const resultsDir = path.join(process.cwd(), 'data/results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const resultsPath = path.join(resultsDir, 'tag_generation_test.json');
    fs.writeFileSync(
      resultsPath, 
      JSON.stringify({ 
        timestamp: new Date().toISOString(),
        content: sampleContent,
        tags: tags,
        count: tags.length
      }, null, 2)
    );
    
    logger.info(`Results saved to ${resultsPath}`);
  } catch (error) {
    logger.error('Error testing tag generation:', error);
  }
}

// Run the test
testTagGeneration()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
