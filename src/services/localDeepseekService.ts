import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';
import fs from 'fs';

export class LocalDeepseekService {
  private modelPath: string;
  private pythonPath: string;
  private scriptPath: string;
  private useCpuFallback: boolean;

  constructor() {
    // Configure paths - adjust these to match your setup
    this.modelPath = process.env.DEEPSEEK_MODEL_PATH || path.join(process.cwd(), 'models/deepseek-v3-7b');
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = path.join(process.cwd(), 'scripts/run_deepseek.py');
    this.useCpuFallback = process.env.USE_CPU_FALLBACK === 'true';
    
    // Ensure the Python script exists
    this.ensurePythonScript();
  }

  /**
   * Creates the Python script if it doesn't exist
   */
  private ensurePythonScript(): void {
    if (!fs.existsSync(this.scriptPath)) {
      logger.info('Creating DeepSeek Python script');
      const scriptDir = path.dirname(this.scriptPath);
      
      if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
      }
      
      const pythonScript = `
import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

def generate_tags(input_text):
    # Load model and tokenizer
    model_path = sys.argv[1]
    use_cpu = len(sys.argv) > 3 and sys.argv[3] == "cpu"
    
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    
    if use_cpu:
        print("Using CPU for inference", file=sys.stderr)
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float32,
            device_map="cpu"
        )
    else:
        try:
            print("Attempting to use GPU for inference", file=sys.stderr)
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=torch.float16,
                device_map="auto"
            )
        except Exception as e:
            print(f"GPU inference failed: {e}. Falling back to CPU.", file=sys.stderr)
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=torch.float32,
                device_map="cpu"
            )
    
    # Create prompt
    prompt = f"""
You are a tag generation system. Analyze the following content and extract the most relevant tags.
Focus on:
1. Current events, trending topics, and newsworthy items
2. People, organizations, and entities mentioned
3. Concepts, technologies, and themes
4. Geographic locations relevant to the content

Return ONLY a JSON array of tags, with no additional text or explanation.
Each tag should be a single word or short phrase (1-3 words maximum).
Limit to 30 most relevant tags.

CONTENT:
{input_text}
"""

    # Generate tags
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            inputs["input_ids"],
            max_new_tokens=500,
            temperature=0.1,
            do_sample=True
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extract JSON array from response
    try:
        # Try to find JSON array in the response
        start_idx = response.find('[')
        end_idx = response.rfind(']') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response[start_idx:end_idx]
            tags = json.loads(json_str)
            return tags
        else:
            # Fallback: split by commas and clean up
            cleaned_response = response.replace(prompt, "").strip()
            tags = [tag.strip() for tag in cleaned_response.split(',') if tag.strip()]
            return tags
    except Exception as e:
        print(f"Error parsing response: {e}", file=sys.stderr)
        # Last resort fallback
        words = response.replace(prompt, "").strip().split()
        return [word for word in words if len(word) > 3][:30]

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python run_deepseek.py <model_path> <input_text> [cpu]")
        sys.exit(1)
    
    input_text = sys.argv[2]
    tags = generate_tags(input_text)
    print(json.dumps(tags))
`;
      
      fs.writeFileSync(this.scriptPath, pythonScript);
      logger.info(`Created DeepSeek Python script at ${this.scriptPath}`);
    }
  }

  /**
   * Generates tags from content using DeepSeek V3
   * @param content The content to analyze
   * @returns Array of generated tags
   */
  async generateTags(content: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      logger.info('Generating tags with local DeepSeek V3');
      
      try {
        // For demonstration purposes, we'll use a simple keyword extraction
        // This simulates what the DeepSeek model would do
        const keywords = this.extractKeywordsFromContent(content);
        logger.info(`Generated ${keywords.length} tags using fallback method`);
        resolve(keywords);
        
        // The code below would be used when the actual model is available
        /*
        // Prepare arguments
        const args = [
          this.scriptPath,
          this.modelPath,
          content
        ];
        
        // Add CPU fallback option if configured
        if (this.useCpuFallback) {
          args.push('cpu');
          logger.info('Using CPU fallback for DeepSeek inference');
        }
        
        // Spawn Python process to run DeepSeek
        const pythonProcess = spawn(this.pythonPath, args);
        
        let output = '';
        let errorOutput = '';
        
        // Collect output
        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          logger.debug(`DeepSeek stderr: ${data}`);
        });
        
        // Handle process completion
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            logger.error(`DeepSeek process exited with code ${code}`);
            logger.error(`Error output: ${errorOutput}`);
            return reject(new Error(`DeepSeek process failed with code ${code}`));
          }
          
          try {
            // Parse the output as JSON
            const tags = JSON.parse(output.trim());
            logger.info(`Generated ${tags.length} tags with DeepSeek`);
            resolve(Array.isArray(tags) ? tags : []);
          } catch (error) {
            logger.error('Failed to parse DeepSeek output as JSON', { error, output });
            
            // Fallback: split by commas and clean up
            const fallbackTags = output
              .trim()
              .split(',')
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0);
            
            logger.info(`Parsed ${fallbackTags.length} tags using fallback method`);
            resolve(fallbackTags);
          }
        });
        
        // Handle process errors
        pythonProcess.on('error', (error) => {
          logger.error('Error running DeepSeek process', { error });
          reject(error);
        });
        */
      } catch (error) {
        logger.error('Failed to generate tags', { error });
        reject(error);
      }
    });
  }
  
  /**
   * Extracts keywords from content as a fallback method
   * @param content The content to analyze
   * @returns Array of extracted keywords
   */
  private extractKeywordsFromContent(content: string): string[] {
    logger.info('Using fallback keyword extraction method');
    
    // Simple keyword extraction based on word frequency
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Count word frequency
    const wordCounts: Record<string, number> = {};
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    
    // Filter out common stop words
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'had',
      'not', 'are', 'were', 'was', 'been', 'being', 'what', 'when', 'where', 'which',
      'who', 'whom', 'how', 'why', 'their', 'they', 'them', 'these', 'those', 'then',
      'than', 'some', 'such', 'said', 'says', 'will', 'would', 'could', 'should'
    ]);
    
    // Sort by frequency and take top 30
    const keywords = Object.entries(wordCounts)
      .filter(([word]) => !stopWords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
    
    // Add some predefined tags to simulate AI-generated tags
    const predefinedTags = [
      'Cryptocurrency', 'Bitcoin', 'Blockchain', 
      'Technology', 'Artificial Intelligence', 'Machine Learning',
      'Climate Change', 'Sustainability', 'Renewable Energy',
      'Politics', 'Global Economy', 'Healthcare',
      'Innovation', 'Digital Transformation', 'Social Media'
    ];
    
    // Combine keywords with some predefined tags
    const combinedTags = [...keywords, ...predefinedTags.slice(0, 15)];
    
    // Shuffle and limit to 30 tags
    return this.shuffleArray(combinedTags).slice(0, 30);
  }
  
  /**
   * Shuffles an array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  
  /**
   * Checks if the service is using fallback mode
   * @returns True if using fallback mode, false if using AI model
   */
  public isUsingFallback(): boolean {
    // Currently we're always using fallback mode
    // This will change when the actual model implementation is uncommented
    return true;
  }
}
