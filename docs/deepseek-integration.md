# DeepSeek V3 Integration for Dynamic Tag Generation

This document outlines the integration of the DeepSeek V3 model for local AI-powered tag generation in the Lockd.app application.

## Overview

The DeepSeek V3 integration replaces external news APIs with a local AI model for generating tags based on content analysis. This approach offers several advantages:

- **Privacy**: All content processing happens locally
- **Cost-effective**: No external API costs
- **Customizable**: Tag generation can be fine-tuned for specific needs
- **Reliable**: No dependency on external services

## Implementation Modes

The system has two implementation modes:

1. **Fallback Mode (Default)**: Uses a local keyword extraction algorithm to generate tags without requiring a GPU or model download. This is suitable for development and testing.

2. **Full AI Mode**: Uses the DeepSeek V3 model for more advanced tag generation. This requires downloading the model and having appropriate GPU resources.

## Requirements

### Fallback Mode
- Node.js 18+
- No additional hardware requirements

### Full AI Mode
- **Hardware**:
  - GPU with at least 16GB VRAM (recommended)
  - CPU-only fallback available (slower performance)
- **Software**:
  - Python 3.8+
  - PyTorch 2.0+
  - Transformers library 4.30+
  - Node.js 18+

## Installation

1. **Set up environment variables**:
   ```
   # DeepSeek V3 Model Configuration
   DEEPSEEK_MODEL_PATH="./models/deepseek-v3-7b"
   PYTHON_PATH="python3"
   USE_CPU_FALLBACK=false
   ```

2. **For Full AI Mode only**:
   - Install Python dependencies:
     ```bash
     pip install -r requirements.txt
     ```
   - Download the model (requires Hugging Face account with appropriate access):
     ```bash
     npm run download-model
     ```

## Usage

### Generating Tags

Tags can be generated in two ways:

1. **Manual generation**:
   ```bash
   npm run generate-tags
   ```

2. **Programmatic generation**:
   ```typescript
   import { DynamicTagGenerator } from '../services/dynamicTagGenerator';

   const tagGenerator = new DynamicTagGenerator();
   const tags = await tagGenerator.generateTags();
   console.log(tags);
   ```

### Configuration Options

- **Model Path**: Set `DEEPSEEK_MODEL_PATH` to change the model location
- **CPU Fallback**: Set `USE_CPU_FALLBACK=true` to force CPU-only mode
- **Python Path**: Set `PYTHON_PATH` to specify a different Python executable

## Implementation Details

The implementation consists of several components:

1. **LocalDeepseekService**: Handles tag generation using either fallback mode or AI model
2. **DynamicTagGenerator**: Manages content sources and tag generation
3. **Python Script**: Runs the DeepSeek model and extracts tags (Full AI Mode only)

### Content Sources

The system uses two main content sources for tag generation:

1. **Recent Posts**: Latest content from the database
2. **Trending Topics**: Currently popular tags

These sources are automatically updated before tag generation.

## Switching Between Modes

To switch from fallback mode to full AI mode:

1. Uncomment the AI model code in `src/services/localDeepseekService.ts`
2. Download the model using `npm run download-model`
3. Ensure Python dependencies are installed

## Troubleshooting

### Common Issues

1. **Out of Memory Errors** (Full AI Mode):
   - Enable CPU fallback: `USE_CPU_FALLBACK=true`
   - Use a smaller model variant

2. **Python Dependency Issues** (Full AI Mode):
   - Ensure Python 3.8+ is installed
   - Run `pip install -r requirements.txt`

3. **Model Download Failures** (Full AI Mode):
   - Check internet connection
   - Verify disk space (need at least 15GB free)
   - Ensure you have proper access to the model on Hugging Face

### Logs

Check the application logs for detailed error messages. The DeepSeek integration includes comprehensive logging.

## Performance Considerations

- Fallback mode is much faster but less accurate
- GPU inference is significantly faster than CPU in full AI mode
- First-time model loading takes longer
- Consider the content size when generating tags (larger content requires more memory)

## Future Improvements

- Fine-tune the model on domain-specific data
- Implement quantization for reduced memory usage
- Add support for multiple languages
- Create a scheduled tag generation process
