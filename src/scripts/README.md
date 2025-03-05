# Vote Transaction Processing Scripts

This directory contains scripts for processing BSV vote transactions and integrating them with the Lockd.app database.

## Scripts Overview

### 1. `insert-vote-transaction.ts`

This script demonstrates how to insert a BSV vote transaction into the database. It creates:
- A post record with `is_vote` set to true
- Vote option records for each option in the vote
- A processed_transaction record

Usage:
```bash
npx tsx src/scripts/insert-vote-transaction.ts
```

### 2. `query-vote-data.ts`

This script queries and displays vote data from the database, including:
- Vote posts with their options
- Vote counts for each option
- Vote percentages

Usage:
```bash
npx tsx src/scripts/query-vote-data.ts
```

### 3. `fix-vote-data.ts`

This script fixes existing vote data in the database by:
- Updating posts to set `is_vote` to true
- Creating missing vote options
- Updating processed_transaction records

Usage:
```bash
npx tsx src/scripts/fix-vote-data.ts
```

## Vote Transaction Service

The `vote-transaction-service.ts` file provides a reusable service for processing vote transactions. It includes methods for:

- Processing individual vote transactions
- Processing bulk vote transactions
- Retrieving vote details

Example usage:

```typescript
import { PrismaClient } from '@prisma/client';
import { VoteTransactionService } from './src/services/vote-transaction-service.js';

const prisma = new PrismaClient();
const voteService = new VoteTransactionService(prisma);

// Process a single transaction
const result = await voteService.processVoteTransaction(transaction);

// Process multiple transactions
const bulkResults = await voteService.processBulkVoteTransactions(transactions);

// Get vote details
const voteDetails = await voteService.getVoteDetails(postId);
```

## Database Schema

Vote transactions are stored in the following tables:

1. `post` - Stores the vote question
   - `is_vote` is set to true for vote posts
   - `content` contains the vote question
   - `metadata` contains additional vote metadata like `options_hash` and `total_options`

2. `vote_option` - Stores the vote options
   - Each option is linked to the post via `post_id`
   - `option_index` indicates the order of the options
   - `content` contains the option text

3. `processed_transaction` - Tracks processed transactions
   - `type` is set to 'vote' for vote transactions
   - `metadata` contains vote-specific data

## Lock Protocol Parser

The scripts use the `LockProtocolParser` to extract vote data from BSV transactions. The parser identifies:

- Vote questions
- Vote options
- Vote metadata (options hash, total options, etc.)

For more details on the parser, see the `lock_protocol_parser.js` file.
