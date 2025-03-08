# Database Client Architecture

This directory contains a modular database client architecture for the lockd.app blockchain transaction scanner.

## Architecture Overview

The new database architecture consists of the following components:

### Base Components

- **BaseDbClient**: A shared base class that provides common database operations, retry logic, and utility functions for all specialized clients.

### Specialized Clients

- **TransactionClient**: Handles operations related to processed transactions.
- **PostClient**: Manages post-related operations, including vote options.
- **LockClient**: Handles lock-related operations (likes/unlikes).

### Main Client

- **DbClient**: The main database client that coordinates between specialized clients.

## Key Benefits

1. **Better Separation of Concerns**: Each client is responsible for a specific domain.
2. **Improved Maintainability**: Smaller, focused modules are easier to understand and modify.
3. **Enhanced Error Handling**: More robust error handling and retry mechanisms.
4. **Consistent Naming**: Uses snake_case consistently throughout the codebase.
5. **Fixed Database Issues**: Addresses issues with post entries, vote option entries, and processed transactions.

## Migration Guide

To migrate from the old DbClient to the new architecture:

1. Import the new DbClient:

```typescript
// Old import (deprecated)
import { DbClient } from '../services/dbClient.js';

// New import
import { db_client } from '../db/index.js';
```

2. Use the new client methods:

```typescript
// Old method (deprecated)
await DbClient.get_instance().processTransaction(tx);

// New method
await db_client.process_transaction(tx);
```

3. Refer to the example usage file for more examples:

```
src/examples/db_migration_example.ts
```

For backward compatibility, the old DbClient class now directly delegates to the new architecture. It will be removed in a future release.

## Migration Flow

The current migration flow is streamlined:

```
Old code → dbClient.ts (with deprecation warnings) → new db_client
```

This approach provides a clean migration path with minimal complexity.

## Common Operations

- **Process Transaction**: `db_client.process_transaction(tx)`
- **Process Transaction Batch**: `db_client.process_transaction_batch(txs)`
- **Get Transaction**: `db_client.get_transaction(tx_id)`
- **Get Post**: `db_client.get_post(post_txid, include_vote_options)`
- **Get Locks for Target**: `db_client.get_locks_for_target(target_txid)`
- **Get Current Block Height**: `db_client.get_current_block_height()`
