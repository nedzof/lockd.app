/**
 * Database Module Index
 * 
 * Exports all database components for easy access.
 * Follows KISS principles with minimal, focused responsibilities.
 */

// Export connection utilities
export { prisma, connect, disconnect } from './connection.js';

// Export base client
export { default as BaseDbClient } from './clients/base_client.js';

// Export specialized clients
export { default as TransactionClient, transaction_client } from './clients/transaction_client.js';
export { default as PostClient, post_client } from './clients/post_client.js';
export { default as LockClient, lock_client } from './clients/lock_client.js';

// Export main client
export { default as DbClient, db_client } from './db_client.js';
