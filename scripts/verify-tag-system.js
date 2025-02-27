#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const modelDir = path.join(projectRoot, 'models/deepseek-v3-7b');
const verificationDir = path.join(projectRoot, 'data/verification');
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

// Create verification directory if it doesn't exist
if (!fs.existsSync(verificationDir)) {
  fs.mkdirSync(verificationDir, { recursive: true });
}

// Verification results
const results = {
  timestamp: new Date().toISOString(),
  modelDirectory: {
    exists: false,
    files: []
  },
  pythonScript: {
    exists: false,
    path: ''
  },
  apiEndpoint: {
    available: false,
    response: null
  },
  summary: {
    status: 'failed',
    message: ''
  }
};

// Check model directory
console.log('Checking model directory...');
if (fs.existsSync(modelDir)) {
  results.modelDirectory.exists = true;
  results.modelDirectory.files = fs.readdirSync(modelDir);
  console.log('✅ Model directory exists');
} else {
  console.log('❌ Model directory not found');
}

// Check Python script
const scriptPath = path.join(projectRoot, 'scripts/run_deepseek.py');
console.log('Checking Python script...');
if (fs.existsSync(scriptPath)) {
  results.pythonScript.exists = true;
  results.pythonScript.path = scriptPath;
  console.log('✅ Python script exists');
} else {
  console.log('❌ Python script not found');
}

// Check API endpoint
console.log('Checking API endpoint...');
(async () => {
  try {
    const response = await axios.post(`${API_URL}/api/post-tagging/generate`, {
      content: 'This is a test content for tag generation verification.'
    });
    
    results.apiEndpoint.available = true;
    results.apiEndpoint.response = response.data;
    console.log('✅ API endpoint is available');
  } catch (error) {
    console.log('❌ API endpoint is not available');
    results.apiEndpoint.error = error.message;
  }
  
  // Generate summary
  if (results.modelDirectory.exists && results.pythonScript.exists && results.apiEndpoint.available) {
    results.summary.status = 'success';
    results.summary.message = 'Tag generation system is fully operational';
  } else if (results.modelDirectory.exists && results.pythonScript.exists) {
    results.summary.status = 'partial';
    results.summary.message = 'Model and script exist, but API endpoint is unavailable';
  } else {
    results.summary.status = 'failed';
    results.summary.message = 'Tag generation system is not properly configured';
  }
  
  // Save verification results
  const resultsPath = path.join(verificationDir, `verification-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Verification results saved to ${resultsPath}`);
  
  // Output summary
  console.log('\nVerification Summary:');
  console.log(`Status: ${results.summary.status}`);
  console.log(`Message: ${results.summary.message}`);
})();
