import { PrismaClient } from '@prisma/client';
import { DbError } from '../../shared/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Base database client class providing common functionality for database operations
 */
export class BaseDbClient {
    protected instance_id: number;
    protected readonly MAX_RETRIES = 3;
    protected readonly RETRY_DELAY = 1000; // 1 second

    constructor() {
        this.instance_id = Date.now();
        logger.debug(`BaseDbClient initialized`, { instance_id: this.instance_id });
    }

    /**
     * Executes a database operation with a fresh Prisma client
     * Handles connection errors and retries if necessary
     */
    protected async with_fresh_client<T>(
        operation: (client: PrismaClient) => Promise<T>,
        retries = this.MAX_RETRIES,
        delay = this.RETRY_DELAY
    ): Promise<T> {
        let last_error: Error | null = null;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Create a fresh client for each operation
                const client = new PrismaClient({
                    datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
                    log: [
                        { level: 'error', emit: 'stdout' },
                        { level: 'warn', emit: 'stdout' },
                    ],
                });
                
                try {
                    // Execute the operation
                    const result = await operation(client);
                    return result;
                } finally {
                    // Always disconnect the client when done
                    await client.$disconnect().catch(err => {
                        logger.warn('DB: ERROR DISCONNECTING CLIENT', {
                            error: err instanceof Error ? err.message : 'Unknown error',
                            attempt
                        });
                    });
                }
            } catch (error) {
                last_error = error instanceof Error ? error : new Error('Unknown database error');
                
                // Check if this is a retryable error
                const is_retryable = this.is_retryable_error(error);
                
                if (attempt < retries && is_retryable) {
                    const wait_time = delay * attempt; // Exponential backoff
                    
                    logger.warn(`DB: OPERATION FAILED, RETRYING (${attempt}/${retries})`, {
                        error: last_error.message,
                        retryable: is_retryable,
                        wait_time: `${wait_time}ms`
                    });
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, wait_time));
                } else if (!is_retryable) {
                    // If error is not retryable, break immediately
                    logger.error('DB: NON-RETRYABLE ERROR', {
                        error: last_error.message,
                        attempt
                    });
                    break;
                }
            }
        }
        
        // If we got here, all retries failed
        logger.error('DB: ALL RETRIES FAILED', {
            error: last_error?.message || 'Unknown error',
            retries
        });
        
        throw last_error || new Error('Database operation failed after multiple retries');
    }

    /**
     * Determines if an error is retryable
     * @param error Error to check
     * @returns True if error is retryable, false otherwise
     */
    protected is_retryable_error(error: unknown): boolean {
        const db_error = error as DbError;
        // Retry on connection errors or deadlocks
        return db_error.code === '40001' || // serialization failure
               db_error.code === '40P01' || // deadlock
               db_error.code === '57P01';   // connection lost
    }

    /**
     * Creates a BigInt from a block time value
     * Handles different formats of block_time (number, BigInt, string)
     * @param block_time Block time in seconds (Unix timestamp)
     * @returns BigInt
     */
    protected create_block_time_bigint(block_time?: number | BigInt | string | null): BigInt {
        try {
            // Handle undefined, null, or invalid input
            if (block_time === undefined || block_time === null) {
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Convert various input types to number
            let block_time_number: number;
            
            if (typeof block_time === 'bigint') {
                return block_time; // Already a BigInt, return as is
            } else if (typeof block_time === 'string') {
                // Check if it's an ISO date string
                if (block_time.includes('T') && block_time.includes('Z')) {
                    const date = new Date(block_time);
                    return BigInt(Math.floor(date.getTime() / 1000));
                }
                block_time_number = parseInt(block_time, 10);
            } else if (typeof block_time === 'number') {
                block_time_number = block_time;
            } else {
                logger.warn('DB: INVALID BLOCK TIME TYPE', { 
                    block_time,
                    type: typeof block_time,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Check if the conversion resulted in a valid number
            if (isNaN(block_time_number)) {
                logger.warn('DB: BLOCK TIME IS NaN', { 
                    block_time,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            // Validate the timestamp is reasonable (between 2009 and 100 years in the future)
            const min_timestamp = new Date('2009-01-03').getTime() / 1000; // Bitcoin genesis block
            const max_timestamp = Date.now() / 1000 + (100 * 365 * 24 * 60 * 60); // 100 years in the future
            
            if (block_time_number < min_timestamp || block_time_number > max_timestamp) {
                logger.warn('DB: INVALID BLOCK TIME RANGE', { 
                    block_time: block_time_number,
                    min_timestamp,
                    max_timestamp,
                    using_current_time: true
                });
                return BigInt(Math.floor(Date.now() / 1000));
            }
            
            return BigInt(block_time_number);
        } catch (error) {
            logger.error('DB: ERROR CREATING BLOCK TIME DATE', {
                block_time,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return BigInt(Math.floor(Date.now() / 1000));
        }
    }

    /**
     * Split an array into chunks
     * @param arr Array to split
     * @param size Chunk size
     * @returns Array of chunks
     */
    protected chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }
}
