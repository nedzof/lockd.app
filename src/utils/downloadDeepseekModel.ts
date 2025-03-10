import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// Define model paths and configuration
const MODEL_NAME = 'meta-llama/Llama-2-7b';
const MODEL_DIR = process.env.DEEPSEEK_MODEL_PATH || path.join(process.cwd(), 'models/deepseek-v3-7b');
const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const REQUIREMENTS_PATH = path.join(process.cwd(), 'requirements.txt');

/**
 * Creates Python requirements file if it doesn't exist
 */
function ensureRequirementsFile() {
  if (!fs.existsSync(REQUIREMENTS_PATH)) {
    const requirements = `
torch>=2.0.0
transformers>=4.30.0
accelerate>=0.20.0
bitsandbytes>=0.39.0
sentencepiece>=0.1.99
protobuf>=3.20.0
`;
    fs.writeFileSync(REQUIREMENTS_PATH, requirements.trim());
    logger.info(`Created Python requirements file at ${REQUIREMENTS_PATH}`);
  }
}

/**
 * Installs Python requirements
 */
async function installRequirements(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    logger.info('Installing Python requirements...');
    
    const pythonProcess = spawn(PYTHON_PATH, [
      '-m', 'pip', 'install', '-r', REQUIREMENTS_PATH
    ]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      logger.debug(chunk);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      logger.debug(chunk);
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Failed to install requirements: ${errorOutput}`);
        reject(new Error(`pip install exited with code ${code}`));
        return;
      }
      
      logger.info('Python requirements installed successfully');
      resolve(true);
    });
    
    pythonProcess.on('error', (error) => {
      logger.error('Error running pip install', { error });
      reject(error);
    });
  });
}

/**
 * Downloads the DeepSeek model using Hugging Face transformers
 */
async function downloadModel(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    logger.info(`Downloading DeepSeek model to ${MODEL_DIR}...`);
    
    // Create model directory if it doesn't exist
    if (!fs.existsSync(MODEL_DIR)) {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
    }
    
    // Python script to download the model
    const downloadScript = `
import os
from transformers import AutoTokenizer, AutoModelForCausalLM

model_name = "${MODEL_NAME}"
model_dir = "${MODEL_DIR}"

print(f"Downloading {model_name} to {model_dir}")

# Download tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.save_pretrained(model_dir)
print("Tokenizer downloaded and saved")

# Download model
model = AutoModelForCausalLM.from_pretrained(model_name)
model.save_pretrained(model_dir)
print("Model downloaded and saved")

print("Download complete!")
`;
    
    const tempScriptPath = path.join(process.cwd(), 'temp_download_script.py');
    fs.writeFileSync(tempScriptPath, downloadScript);
    
    const pythonProcess = spawn(PYTHON_PATH, [tempScriptPath]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      logger.info(chunk);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      logger.debug(chunk);
    });
    
    pythonProcess.on('close', (code) => {
      // Clean up temp script
      if (fs.existsSync(tempScriptPath)) {
        fs.unlinkSync(tempScriptPath);
      }
      
      if (code !== 0) {
        logger.error(`Failed to download model: ${errorOutput}`);
        reject(new Error(`Model download exited with code ${code}`));
        return;
      }
      
      logger.info('DeepSeek model downloaded successfully');
      resolve(true);
    });
    
    pythonProcess.on('error', (error) => {
      // Clean up temp script
      if (fs.existsSync(tempScriptPath)) {
        fs.unlinkSync(tempScriptPath);
      }
      
      logger.error('Error running model download', { error });
      reject(error);
    });
  });
}

/**
 * Verifies that the model was downloaded correctly
 */
function verifyModelDownload(): boolean {
  const requiredFiles = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'pytorch_model.bin'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(MODEL_DIR, file);
    if (!fs.existsSync(filePath)) {
      logger.error(`Missing required model file: ${file}`);
      return false;
    }
  }
  
  logger.info('Model verification successful');
  return true;
}

/**
 * Main function to download and set up the DeepSeek model
 */
async function main() {
  try {
    logger.info('Starting DeepSeek model download process');
    
    // Ensure requirements file exists
    ensureRequirementsFile();
    
    // Install Python requirements
    await installRequirements();
    
    // Check if model already exists
    if (fs.existsSync(MODEL_DIR) && fs.readdirSync(MODEL_DIR).length > 0) {
      logger.info(`DeepSeek model already exists at ${MODEL_DIR}`);
      
      // Verify model files
      if (verifyModelDownload()) {
        logger.info('Model verification successful, skipping download');
        process.exit(0);
      } else {
        logger.warn('Model verification failed, re-downloading model');
      }
    }
    
    // Download model
    await downloadModel();
    
    // Verify download
    if (verifyModelDownload()) {
      logger.info('DeepSeek model setup completed successfully');
      process.exit(0);
    } else {
      logger.error('Model verification failed after download');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Error setting up DeepSeek model:', error);
    process.exit(1);
  }
}

// Run the download process
main();
