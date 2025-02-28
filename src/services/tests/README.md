# Lockd.app Testing Guide

This directory contains tests for the Lockd.app backend services, focusing on transaction parsing and database integration.

## Test Types

### Integration Tests

Integration tests verify that different components of the system work together correctly. The main integration test is:

- `parser.integration.test.ts`: Tests the transaction parsing system and database integration

### Unit Tests

Unit tests verify individual components in isolation. These include:

- (Add unit test files as they are created)

## Running Tests

To run all tests:

```bash
npm test
```

To run a specific test file:

```bash
npm test -- src/services/tests/parser.integration.test.ts
```

## Test Architecture

### Transaction Parser Testing

The transaction parser tests verify that:

1. Posts can be created in the database
2. Existing posts can be updated
3. Vote posts with options can be created and retrieved

The tests use direct database access via Prisma to create and verify posts, bypassing the JungleBus API to avoid external dependencies.

### Mock Transactions

The tests use mock transaction data that mimics the structure of real transactions from the blockchain. This allows testing the database integration without requiring actual blockchain data.

## Test Data Cleanup

All tests are designed to clean up after themselves, removing any test data created during the test run. This ensures that tests don't interfere with each other and that the test database remains clean.

## Adding New Tests

When adding new tests, follow these guidelines:

1. Use descriptive test names that clearly indicate what is being tested
2. Clean up any test data created during the test
3. Use unique identifiers for test data to avoid conflicts
4. Add appropriate logging to help debug test failures
5. Follow the snake_case naming convention for database fields

## Database Schema Conventions

The Lockd.app database uses snake_case for column names, with TypeScript interfaces matching this convention. Key examples:

- `post_id` (not postId)
- `author_address` (not authorAddress)
- `created_at`, `updated_at` (not createdAt, updatedAt)
- `block_height`, `block_time` (not blockHeight, blockTime)
- `is_vote`, `is_locked` (not isVote, isLocked)
