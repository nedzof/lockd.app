# Parser Module

This module provides a modular approach to parsing blockchain transactions for the LOCK protocol.

## Architecture

The parser module follows a modular architecture similar to the DB client module, with specialized parsers for different types of data extraction:

1. **BaseParser**: Provides common utilities like decoding, sanitization, etc.
2. **TransactionDataParser**: Extracts and parses raw transaction data from JungleBus
3. **LockProtocolParser**: Parses LOCK protocol specific data
4. **MediaParser**: Handles image and media extraction/processing
5. **VoteParser**: Extracts and processes vote-related data
6. **MainParser**: Orchestrates all specialized parsers

## Usage

### Basic Usage

```typescript
// Import the singleton parser instance
import { parser } from '../parser/index.js';

// Parse a single transaction
await parser.parse_transaction('transaction_id_here');

// Parse multiple transactions
await parser.parse_transactions(['tx_id_1', 'tx_id_2', 'tx_id_3']);
```

### Advanced Usage

You can also use the specialized parsers directly if needed:

```typescript
import { 
  TransactionDataParser, 
  LockProtocolParser 
} from '../parser/index.js';

// Create instances
const txParser = new TransactionDataParser();
const lockParser = new LockProtocolParser();

// Fetch a transaction
const tx = await txParser.fetch_transaction('tx_id_here');

// Extract data
const data = txParser.extract_data_from_transaction(tx);

// Parse LOCK protocol data
const lockData = lockParser.extract_lock_protocol_data(data, tx);
```

## Migration Guide

To migrate from the old TransactionParser to the new architecture:

1. Import the new parser:

```typescript
// Old import (deprecated)
import { TransactionParser } from '../services/parser.js';

// New import
import { parser } from '../parser/index.js';
```

2. Use the new parser methods:

```typescript
// Old approach (deprecated)
const transactionParser = new TransactionParser(dbClient);
await transactionParser.parseTransaction(tx_id);

// New approach
await parser.parse_transaction(tx_id);
```

For backward compatibility, the old TransactionParser class now delegates to the new architecture. It will be removed in a future release.

## Helper Functions

The module also provides several helper functions for transaction data processing:

```typescript
import { 
  extract_tags, 
  extract_vote_data, 
  decode_hex_string,
  sanitize_for_db 
} from '../parser/index.js';

// Extract tags from transaction data
const tags = extract_tags(data);

// Extract vote data
const voteData = extract_vote_data(data);
```

## Migration Flow

The current migration flow is streamlined:

```
Old code → parser.ts (with deprecation warnings) → new parser module
```

This approach provides a clean migration path with minimal complexity.
