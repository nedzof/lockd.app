# Transaction Processing for JSON Ordinals

This directory contains the components used for processing Bitcoin transaction data and extracting content from JSON ordinal inscriptions.

## Overview

The Lockd.app platform now exclusively uses a JSON-based ordinal inscription format for content and metadata. This approach simplifies parsing and provides a consistent data structure.

## Key Components

- **ordinal_parser.js**: Core functions for parsing JSON ordinal inscriptions
- **tx_parser.js**: Parses Bitcoin transactions to extract JSON ordinal inscriptions
- **tx_fetcher.js**: Fetches transaction data from the blockchain

## JSON Ordinal Format

The format follows this structure:

```json
{
  "content": "The main content of the post",
  "metadata": {
    "protocol": "lockd.app",
    "post_id": "unique-post-identifier",
    "author_address": "bitcoin_address",
    "is_vote": false,
    "is_locked": true,
    "lock_amount": 1000,
    "lock_duration": 86400,
    "content_type": "text/plain",
    "tags": ["tag1", "tag2"]
  },
  "image_metadata": {
    "content_type": "image/jpeg",
    "filename": "image.jpg",
    "width": 800,
    "height": 600
  },
  "vote_data": {
    "question": "What's your favorite color?",
    "options": [
      {"content": "Red", "index": 0},
      {"content": "Blue", "index": 1},
      {"content": "Green", "index": 2}
    ],
    "total_options": 3
  }
}
```

## Benefits of JSON Format

1. **Type Safety**: Consistent structure makes processing more reliable
2. **Simplicity**: No need for complex hex parsing or data extraction
3. **Extensibility**: Easy to add new fields without modifying parsing logic
4. **Validation**: Simple to validate against a schema
5. **Efficiency**: Faster processing with fewer edge cases

## Integration

The scanner processes transactions, looks for outputs containing JSON ordinal inscriptions, and saves the structured data to the database. Posts are then created from this structured data.

## Usage

The transaction parser and related functionality are used by the blockchain scanner, which monitors for new transactions containing lockd.app data.

```typescript
import { tx_parser } from './services/tx';

// Parse a transaction
const parsedTx = await tx_parser.parse_transaction(txId);

// Check for valid lockd.app outputs
const lockdOutputs = parsedTx.outputs.filter(output => 
  output.isValid && output.type === 'lockd'
);
``` 