# Lockd.app Tag Generation System

A robust, privacy-focused tag generation service using local AI and fallback mechanisms.

## Overview

The tag generation system provides automatic keyword extraction and tagging capabilities for content within the Lockd.app ecosystem. It's designed with privacy as the primary concern, processing all content locally without external API dependencies.

## Features

- **Privacy-First**: All processing happens locally on your machine
- **Dual-Mode Operation**:
  - Fallback Mode: Uses natural language processing for keyword extraction
  - AI Mode: Leverages DeepSeek V3 model for advanced tag generation
- **Flexible Integration**: API endpoints and direct service calls
- **Performance Optimized**: Fast response times even in fallback mode
- **Comprehensive Testing**: Verification tools to ensure system integrity

## Architecture

### Backend Components

- **Service**: `LocalDeepseekService` (src/services/localDeepseekService.ts)
- **API Endpoint**: `/api/tag-generation` (POST)
- **Controller**: `tagGenerationController.ts`
- **Routes**: `tagGenerationRoutes.ts`
- **Job**: `tagGenerationJob.ts`

### Frontend Components

- **React Page**: `TagGenerator.tsx`
- **Navigation**: Integrated in `Layout.tsx`
- **Routing**: Added to `App.tsx`

## Setup and Configuration

### Environment Variables

Add these to your `.env` file:

```
DEEPSEEK_MODEL_PATH="./models/deepseek-v3-7b"
PYTHON_PATH="python3"
USE_CPU_FALLBACK=false
```

### Dependencies

#### Python Dependencies

```bash
pip install torch transformers accelerate bitsandbytes
```

#### Node.js Dependencies

Already included in package.json:
- axios
- natural
- prisma
- react-router-dom
- material-ui

### Model Setup

1. Download the DeepSeek V3 model:
```bash
npm run download-model
```

2. Verify the model is properly installed:
```bash
npm run verify-tag-system
```

## Usage

### API Endpoint

```typescript
// Example API call
const response = await axios.post('http://localhost:3003/api/tag-generation', {
  content: 'Your content to generate tags from'
});
const tags = response.data.data.tags;
```

### Direct Service Usage

```typescript
import { LocalDeepseekService } from '../services/localDeepseekService';

const deepseekService = new LocalDeepseekService();
const tags = await deepseekService.generateTags('Your content here');
```

### Testing and Verification

1. Test the API endpoint:
```bash
npm run tag-generator
```

2. Verify the entire system:
```bash
npm run verify-tag-system
```

This will run comprehensive tests and generate verification reports in `data/verification/`.

## System Verification

The verification script checks:

1. Direct service functionality
2. API endpoint availability and response
3. Python script existence
4. Model directory presence

Results are saved as JSON files in the `data/verification/` directory, with a summary report that provides an overview of system health.

## Performance Considerations

- **Fallback Mode**: <100ms response time
- **AI Mode**: 
  - GPU: 1-3 seconds
  - CPU: 5-10 seconds
- **Resource Requirements**:
  - ~14GB RAM
  - ~14GB disk space for model

## Future Enhancements

1. Multi-language support
2. Model fine-tuning for domain-specific tagging
3. Advanced tag clustering and categorization
4. Scheduled tag generation for content databases
5. Sentiment analysis integration

## Troubleshooting

If you encounter issues:

1. Check verification reports in `data/verification/`
2. Ensure Python and required packages are installed
3. Verify model download is complete
4. Check server logs for detailed error messages

## Security Considerations

- All processing happens locally
- No external API calls
- Content sources are controlled
- Fallback mechanism prevents system failures

## Documentation

For more detailed information, see:
- [Tag Generation API Documentation](docs/tag-generation-api.md)
- Code comments in respective files
