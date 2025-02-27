import { LocalDeepseekService } from '../services/localDeepseekService';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

/**
 * Comprehensive test script to verify the tag generation system
 * Tests both the direct service and the API endpoint
 */
async function verifyTagGenerationSystem() {
  logger.info('Starting tag generation system verification');
  
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
  
  // Create results directory
  const resultsDir = path.join(process.cwd(), 'data/verification');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Test 1: Direct Service Test
  logger.info('Test 1: Testing LocalDeepseekService directly');
  try {
    const deepseekService = new LocalDeepseekService();
    const serviceStartTime = Date.now();
    const serviceTags = await deepseekService.generateTags(sampleContent);
    const serviceEndTime = Date.now();
    
    const serviceResults = {
      test: 'direct_service',
      success: true,
      tags: serviceTags,
      count: serviceTags.length,
      mode: deepseekService.isUsingFallback() ? 'fallback' : 'ai',
      executionTimeMs: serviceEndTime - serviceStartTime,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(resultsDir, 'direct_service_test.json'),
      JSON.stringify(serviceResults, null, 2)
    );
    
    logger.info(`Test 1 completed successfully. Generated ${serviceTags.length} tags using ${serviceResults.mode} mode`);
    logger.info(`Execution time: ${serviceResults.executionTimeMs}ms`);
  } catch (error) {
    logger.error('Test 1 failed:', error);
  }
  
  // Test 2: API Endpoint Test
  logger.info('Test 2: Testing API endpoint');
  try {
    const apiUrl = 'http://localhost:3003/api/tag-generation';
    const apiStartTime = Date.now();
    
    try {
      const response = await axios.post(apiUrl, { content: sampleContent });
      const apiEndTime = Date.now();
      
      const apiResults = {
        test: 'api_endpoint',
        success: true,
        response: response.data,
        executionTimeMs: apiEndTime - apiStartTime,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(resultsDir, 'api_endpoint_test.json'),
        JSON.stringify(apiResults, null, 2)
      );
      
      logger.info(`Test 2 completed successfully. API returned ${response.data.data.tags.length} tags using ${response.data.data.mode} mode`);
      logger.info(`Execution time: ${apiResults.executionTimeMs}ms`);
    } catch (apiError) {
      logger.error('API call failed:', apiError.message);
      
      const apiResults = {
        test: 'api_endpoint',
        success: false,
        error: apiError.message,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(resultsDir, 'api_endpoint_test.json'),
        JSON.stringify(apiResults, null, 2)
      );
    }
  } catch (error) {
    logger.error('Test 2 failed:', error);
  }
  
  // Test 3: Python Script Availability
  logger.info('Test 3: Checking Python script availability');
  try {
    const deepseekService = new LocalDeepseekService();
    const scriptPath = path.join(process.cwd(), 'scripts/run_deepseek.py');
    
    const scriptExists = fs.existsSync(scriptPath);
    
    const scriptResults = {
      test: 'python_script',
      success: scriptExists,
      scriptPath,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(resultsDir, 'python_script_test.json'),
      JSON.stringify(scriptResults, null, 2)
    );
    
    if (scriptExists) {
      logger.info('Test 3 completed successfully. Python script exists');
    } else {
      logger.warn('Test 3 completed with warnings. Python script does not exist');
    }
  } catch (error) {
    logger.error('Test 3 failed:', error);
  }
  
  // Test 4: Model Directory Check
  logger.info('Test 4: Checking model directory');
  try {
    const modelPath = process.env.DEEPSEEK_MODEL_PATH || path.join(process.cwd(), 'models/deepseek-v3-7b');
    const modelDirExists = fs.existsSync(modelPath);
    
    const modelResults = {
      test: 'model_directory',
      success: modelDirExists,
      modelPath,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(resultsDir, 'model_directory_test.json'),
      JSON.stringify(modelResults, null, 2)
    );
    
    if (modelDirExists) {
      logger.info('Test 4 completed successfully. Model directory exists');
    } else {
      logger.warn('Test 4 completed with warnings. Model directory does not exist');
    }
  } catch (error) {
    logger.error('Test 4 failed:', error);
  }
  
  // Generate summary report
  try {
    const summaryReport = {
      timestamp: new Date().toISOString(),
      tests: [
        JSON.parse(fs.readFileSync(path.join(resultsDir, 'direct_service_test.json'), 'utf8')),
        fs.existsSync(path.join(resultsDir, 'api_endpoint_test.json')) 
          ? JSON.parse(fs.readFileSync(path.join(resultsDir, 'api_endpoint_test.json'), 'utf8'))
          : { test: 'api_endpoint', success: false, error: 'Test did not complete' },
        JSON.parse(fs.readFileSync(path.join(resultsDir, 'python_script_test.json'), 'utf8')),
        JSON.parse(fs.readFileSync(path.join(resultsDir, 'model_directory_test.json'), 'utf8'))
      ],
      overallStatus: 'completed'
    };
    
    fs.writeFileSync(
      path.join(resultsDir, 'verification_summary.json'),
      JSON.stringify(summaryReport, null, 2)
    );
    
    logger.info('Verification summary report generated');
  } catch (error) {
    logger.error('Failed to generate summary report:', error);
  }
  
  logger.info('Tag generation system verification completed');
}

// Run the verification
verifyTagGenerationSystem()
  .then(() => {
    logger.info('Verification process completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Verification process failed:', error);
    process.exit(1);
  });
