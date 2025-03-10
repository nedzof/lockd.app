# Scripts Directory

This directory contains core scripts for managing and interacting with the Lockd.app application. The scripts have been consolidated into focused, maintainable modules.

## Directory Structure

```
scripts/
├── transactions/    # Transaction processing module
│   └── transaction-processor.ts  # Consolidated transaction processing
├── scanner/         # Blockchain scanner module
│   └── scanner.ts               # Consolidated scanner functionality
├── tags/           # Tag management module
│   └── tag-manager.ts          # Consolidated tag management
└── README.md       # This file
```

## Core Modules

### Transaction Processor
The `TransactionProcessor` class in `transaction-processor.ts` handles all transaction-related operations:
- Processing individual and bulk transactions
- Vote transaction handling
- Transaction verification and reprocessing
- Content source updates

### Scanner
The `Scanner` class in `scanner.ts` provides blockchain scanning functionality:
- Blockchain scanning with JungleBus integration
- Transaction monitoring and processing
- Database synchronization
- Cleanup and maintenance

### Tag Manager
The `TagManager` class in `tag-manager.ts` manages all tag-related operations:
- Automatic tag generation
- Tag system verification
- Tag cleanup and maintenance
- Usage statistics

## Core Services

The application relies on these essential services:
- `junglebus_service.ts`: Core blockchain interaction
- `tx_parser.ts`: Transaction parsing
- `vote-transaction-service.ts`: Vote handling
- `config.ts`: Configuration
- `logger.ts`: Logging

## Usage

Run the scripts using npm commands:

```bash
# Start the blockchain scanner
npm run scanner

# Process transactions
npm run process-transactions

# Manage tags
npm run generate-tags
```

## Development

When adding new functionality:
1. Add it to the appropriate module class
2. Keep the code organized and focused
3. Follow the established patterns
4. Update tests as needed
5. Document new features

## Module Details

### Transaction Processor
```typescript
import { TransactionProcessor } from './transactions/transaction-processor';

const processor = new TransactionProcessor();

// Process transactions
await processor.processTransactions(txIds, {
  reprocess: false,
  updateContent: true,
  skipExisting: true
});

// Get statistics
const stats = await processor.getStats();
```

### Scanner
```typescript
import { Scanner } from './scanner/scanner';

const scanner = new Scanner({
  environment: 'production',
  startBlock: 885872
});

// Start scanning
await scanner.start({
  cleanupDb: false
});

// Stop scanning
await scanner.stop();
```

### Tag Manager
```typescript
import { TagManager } from './tags/tag-manager';

const tagManager = new TagManager();

// Generate tags
await tagManager.generateTags({
  batchSize: 100,
  updateExisting: true
});

// Verify tag system
const verification = await tagManager.verifyTagSystem();

// Clean up tags
await tagManager.cleanupTags();
```

## Vote Transaction Processing

For detailed information about vote transaction processing, see the vote-transaction-service.ts file in the services directory.
