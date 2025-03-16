# Vote Transaction Processing

This document explains how vote transactions are processed in the Lockd.app backend.

## Overview

The system now processes all incoming BSV transactions for vote data, not just specific examples. This is achieved through the following components:

1. **VoteTransactionService**: A service that handles the processing of vote transactions.
2. **MainParser**: Updated to integrate with the VoteTransactionService.
3. **DbClient**: Enhanced to handle vote transactions as a distinct type.

## Flow of Vote Processing

1. The scanner service receives transactions from JungleBus.
2. MainParser processes each transaction and checks if it's a vote transaction.
3. If it's a vote transaction, the VoteTransactionService processes it:
   - Extracts vote data (question and options)
   - Creates a post record with `is_vote=true`
   - Creates vote option records linked to the post
   - Updates the processed_transaction record with type='vote'

## Key Components

### VoteTransactionService

Located at `src/services/vote-transaction-service.ts`, this service:
- Processes transactions with vote data
- Creates post and vote_option records
- Handles both new and existing transactions
- Provides methods to retrieve vote data

### MainParser Integration

The MainParser (in `src/parser/main_parser.ts`) now:
- Identifies vote transactions
- Extracts vote data using the VoteParser
- Passes vote transactions to the VoteTransactionService
- Falls back to standard processing if vote processing fails

### DbClient Enhancements

The DbClient (in `src/db/index.ts`) now:
- Handles 'vote' as a distinct transaction type
- Creates post records with is_vote=true
- Creates vote_option records for each option

## Utility Scripts

### Process All Vote Transactions

The script at `src/scripts/process-all-vote-transactions.ts` can be used to:
- Scan all existing transactions for vote data
- Process any found vote transactions
- Update transaction types to 'vote' where appropriate

Run it with:
```
npm run ts-node src/scripts/process-all-vote-transactions.ts
```

### Process Vote Example

The script at `src/scripts/process-vote-example.ts` demonstrates:
- How a vote transaction is processed
- The structure of vote data
- The resulting database records

Run it with:
```
npm run ts-node src/scripts/process-vote-example.ts
```

## Testing

To test the vote processing functionality:
1. Run the example script to process a sample vote transaction
2. Check the database for the created post and vote options
3. Run the scanner service to process real transactions
4. Verify that vote transactions are correctly identified and processed

## Database Schema

Vote data is stored in the following tables:
- `post`: Records with `is_vote=true` represent vote posts
- `vote_option`: Contains the options for each vote post
- `processed_transaction`: Records with `type='vote'` represent vote transactions

## Troubleshooting

If vote transactions are not being processed correctly:
1. Check the logs for any errors in the VoteTransactionService
2. Verify that the transaction data contains the required vote fields
3. Run the process-all-vote-transactions script to reprocess transactions
4. Check the database for any inconsistencies in vote data
