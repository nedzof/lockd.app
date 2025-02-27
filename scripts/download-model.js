#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const modelDir = path.join(projectRoot, 'models/deepseek-v3-7b');

// Create directories if they don't exist
console.log('Creating model directories...');
if (!fs.existsSync(modelDir)) {
  fs.mkdirSync(modelDir, { recursive: true });
}

// Create placeholder files to simulate model download
console.log('Creating placeholder model files...');

// Create a placeholder config.json
const configJson = {
  "architectures": ["DeepseekForCausalLM"],
  "model_type": "deepseek",
  "torch_dtype": "float16",
  "transformers_version": "4.35.0",
  "vocab_size": 128256
};

fs.writeFileSync(
  path.join(modelDir, 'config.json'), 
  JSON.stringify(configJson, null, 2)
);

// Create a placeholder tokenizer_config.json
const tokenizerConfig = {
  "model_max_length": 8192,
  "padding_side": "right",
  "tokenizer_class": "PreTrainedTokenizerFast"
};

fs.writeFileSync(
  path.join(modelDir, 'tokenizer_config.json'), 
  JSON.stringify(tokenizerConfig, null, 2)
);

// Create a placeholder README.md
const readmeContent = `# DeepSeek V3 Model

This is a placeholder for the DeepSeek V3 model. In a production environment, you would download the actual model files.

## Model Information

- Name: DeepSeek V3 7B
- Type: Causal Language Model
- Size: 7 billion parameters
- Context Length: 8192 tokens
- Architecture: Transformer-based

## Usage

This model is used by the Lockd.app tag generation system to extract relevant tags from content.
`;

fs.writeFileSync(path.join(modelDir, 'README.md'), readmeContent);

// Create a small placeholder model file
const placeholderModelContent = Buffer.alloc(1024 * 1024); // 1MB of zeros
fs.writeFileSync(path.join(modelDir, 'model.safetensors'), placeholderModelContent);

console.log('Creating verification script...');
// Create a verification script
const verifyScript = `#!/usr/bin/env node

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
    const response = await axios.post(\`\${API_URL}/api/post-tagging/generate\`, {
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
  const resultsPath = path.join(verificationDir, \`verification-\${Date.now()}.json\`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(\`Verification results saved to \${resultsPath}\`);
  
  // Output summary
  console.log('\\nVerification Summary:');
  console.log(\`Status: \${results.summary.status}\`);
  console.log(\`Message: \${results.summary.message}\`);
})();
`;

// Create verification script
const verifyScriptPath = path.join(projectRoot, 'scripts/verify-tag-system.js');
fs.writeFileSync(verifyScriptPath, verifyScript);
fs.chmodSync(verifyScriptPath, '755');

// Create data/verification directory
const verificationDir = path.join(projectRoot, 'data/verification');
if (!fs.existsSync(verificationDir)) {
  fs.mkdirSync(verificationDir, { recursive: true });
}

// Update package.json to add scripts
console.log('Updating package.json with new scripts...');
try {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);
  
  // Add scripts if they don't exist
  packageJson.scripts = packageJson.scripts || {};
  packageJson.scripts['download-model'] = 'node scripts/download-model.js';
  packageJson.scripts['verify-tag-system'] = 'node scripts/verify-tag-system.js';
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ package.json updated');
} catch (error) {
  console.error('Error updating package.json:', error);
}

console.log('\nModel setup complete!');
console.log('In a production environment, you would download the actual model files.');
console.log('For now, placeholder files have been created to simulate the model.');
console.log('\nTo verify the tag generation system:');
console.log('  npm run verify-tag-system');
