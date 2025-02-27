# Tag Generation API

This document provides comprehensive information about the Tag Generation API in the Lockd.app project.

## Overview

The Tag Generation API provides an endpoint for generating relevant tags from content using a local AI-powered approach. The system is designed with two operational modes:

1. **AI Mode**: Uses the DeepSeek V3 language model for high-quality tag generation (requires model download)
2. **Fallback Mode**: Uses a keyword extraction algorithm when the AI model is not available

## API Endpoints

### Generate Tags

```
POST /api/tag-generation
```

Generates tags from the provided content.

**Request Body:**

```json
{
  "content": "Your content text here..."
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "tags": ["Tag1", "Tag2", "Tag3", ...],
    "count": 30,
    "mode": "fallback" // or "ai"
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message here",
  "error": "Detailed error message (development mode only)"
}
```

## Implementation Details

### Components

1. **LocalDeepseekService**: Core service for tag generation
   - Located at: `src/services/localDeepseekService.ts`
   - Handles both AI and fallback modes
   - Manages Python script for AI model interaction

2. **Tag Generation Controller**: Handles API requests
   - Located at: `src/controllers/tagGenerationController.ts`
   - Validates input
   - Calls the LocalDeepseekService
   - Formats responses

3. **Tag Generation Routes**: Defines API endpoints
   - Located at: `src/routes/tagGenerationRoutes.ts`
   - Maps routes to controllers

4. **Scripts**:
   - `src/scripts/downloadDeepseekModel.ts`: Downloads the DeepSeek V3 model
   - `src/scripts/testTagGeneration.ts`: Tests tag generation directly
   - `src/scripts/testTagGenerationAPI.ts`: Tests the API endpoint
   - `src/scripts/updateContentSources.ts`: Updates content sources for tag generation

### Fallback Mode

The fallback mode uses a keyword extraction algorithm that:

1. Analyzes text content to identify frequent words
2. Filters out common stop words
3. Combines extracted keywords with predefined tags
4. Shuffles and limits to 30 tags

This ensures tag generation works even without the AI model.

### AI Mode

The AI mode uses the DeepSeek V3 language model to:

1. Process content with a specialized prompt
2. Generate contextually relevant tags
3. Parse the model output into a structured format

This provides higher quality, more contextually relevant tags.

## Configuration

Configuration is managed through environment variables:

```
# DeepSeek V3 Model Configuration
DEEPSEEK_MODEL_PATH="./models/deepseek-v3-7b"
PYTHON_PATH="python3"
USE_CPU_FALLBACK=false
```

- `DEEPSEEK_MODEL_PATH`: Path to the downloaded model
- `PYTHON_PATH`: Path to Python executable
- `USE_CPU_FALLBACK`: Whether to use CPU for inference when GPU is unavailable

## Usage Examples

### Direct Service Usage

```typescript
import { LocalDeepseekService } from '../services/localDeepseekService';

const deepseekService = new LocalDeepseekService();
const content = "Your content here...";
const tags = await deepseekService.generateTags(content);

console.log(`Generated ${tags.length} tags using ${deepseekService.isUsingFallback() ? 'fallback' : 'AI'} mode`);
console.log(tags);
```

### API Usage

```typescript
import axios from 'axios';

const apiUrl = 'http://localhost:3003/api/tag-generation';
const content = "Your content here...";

const response = await axios.post(apiUrl, { content });

if (response.data.success) {
  const { tags, count, mode } = response.data.data;
  console.log(`Generated ${count} tags using ${mode} mode`);
  console.log(tags);
} else {
  console.error('Tag generation failed:', response.data.message);
}
```

## Setting Up the AI Model

To use the full AI mode:

1. Run the download script:
   ```
   npm run download-model
   ```

2. Ensure Python dependencies are installed:
   ```
   pip install -r requirements.txt
   ```

3. Set the appropriate environment variables in `.env`

## Troubleshooting

### Common Issues

1. **Model Download Failures**
   - Check internet connection
   - Ensure sufficient disk space
   - Try running with admin/sudo privileges

2. **Python Dependency Issues**
   - Verify Python version (3.8+ recommended)
   - Check for conflicting packages
   - Try creating a virtual environment

3. **Tag Generation Failures**
   - Check logs for specific errors
   - Verify model path is correct
   - Try using fallback mode with `USE_CPU_FALLBACK=true`

## Performance Considerations

- **Memory Usage**: The DeepSeek V3 model requires approximately 14GB of RAM
- **Disk Space**: The model requires about 14GB of disk space
- **Processing Time**: 
  - AI mode: 1-3 seconds per request (GPU), 5-10 seconds (CPU)
  - Fallback mode: <100ms per request

## Security Considerations

- All processing is done locally, no external API calls
- No user data is sent outside the application
- Model runs in a sandboxed environment

## Future Enhancements

- Fine-tuning the model on domain-specific data
- Adding multi-language support
- Implementing tag clustering for better organization
- Adding tag sentiment analysis
