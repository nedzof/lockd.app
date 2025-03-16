/**
 * @jest-environment node
 * @jest-environment-options {"forceExit": true}
 */

import { describe, expect, test, beforeAll, afterAll } from '@jest/globals'
import { config } from 'dotenv'
import { join } from 'path'
import { logger } from '../../utils/logger.js'

// Load test environment variables
config({
    path: join(process.cwd(), '.env.test')
})

// Import sql after loading environment variables
const sqlPromise = (async () => {
    try {
        const { default: sql } = await import('../connection')
        return sql
    } catch (error) {
        logger.error('Failed to import SQL connection', { error })
        throw error
    }
})()

describe('Database Connection Tests', () => {
    let db: any

    beforeAll(async () => {
        try {
            db = await sqlPromise
        } catch (error) {
            logger.error('Failed to initialize database connection', { error })
            throw error
        }
    })

    afterAll(async () => {
        // Close the database connection
        try {
            if (db) {
                await db.end()
                logger.info('Database connection closed')
            }
        } catch (error) {
            logger.error('Failed to close database connection', { error })
        }
    })

    test('should connect to the database', async () => {
        // Test a simple query
        try {
            const result = await db`SELECT 1 + 1 AS sum`
            expect(result[0].sum).toBe(2)
        } catch (error) {
            logger.error('Database query failed', { error })
            throw error
        }
    })

    test('should handle query errors', async () => {
        // Try to query a non-existent table
        try {
            await expect(db`SELECT * FROM nonexistent_table`).rejects.toThrow()
        } catch (error) {
            logger.error('Expected error test failed', { error })
            throw new Error('Expected query to throw an error but it did not')
        }
    })
})
