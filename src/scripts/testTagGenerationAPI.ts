import axios from 'axios';
import { logger } from '../utils/logger';
import { LocalDeepseekService } from '../services/localDeepseekService';

/**
 * Test the tag generation API endpoint
 */
async function testTagGenerationAPI() {
  try {
    logger.info('Testing tag generation API endpoint');
    
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
    `;
    
    // API endpoint
    const apiUrl = 'http://localhost:3003/api/tag-generation';
    
    try {
      // Make the API request
      logger.info(`Sending request to ${apiUrl}`);
      const response = await axios.post(apiUrl, { content: sampleContent });
      
      // Log the response
      logger.info('API Response:', response.data);
      
      if (response.data.success) {
        const { tags, count, mode } = response.data.data;
        logger.info(`Successfully generated ${count} tags using ${mode} mode`);
        logger.info('Tags:', tags.join(', '));
      } else {
        logger.error('Tag generation failed:', response.data.message);
      }
    } catch (apiError) {
      logger.error('API call failed, using direct service call instead:', apiError.message);
      
      // Fallback to direct service call
      const deepseekService = new LocalDeepseekService();
      const tags = await deepseekService.generateTags(sampleContent);
      
      logger.info(`Generated ${tags.length} tags using direct service call (${deepseekService.isUsingFallback() ? 'fallback' : 'AI'} mode)`);
      logger.info('Tags:', tags.join(', '));
      
      // Save results to a file
      const fs = require('fs');
      const path = require('path');
      const resultsDir = path.join(process.cwd(), 'data/results');
      
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const resultsPath = path.join(resultsDir, 'direct_service_test.json');
      fs.writeFileSync(
        resultsPath, 
        JSON.stringify({ 
          timestamp: new Date().toISOString(),
          content: sampleContent,
          tags: tags,
          count: tags.length,
          mode: deepseekService.isUsingFallback() ? 'fallback' : 'AI'
        }, null, 2)
      );
      
      logger.info(`Results saved to ${resultsPath}`);
    }
  } catch (error) {
    logger.error('Error testing tag generation API:', error.response?.data || error.message);
  }
}

// Run the test
testTagGenerationAPI()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
