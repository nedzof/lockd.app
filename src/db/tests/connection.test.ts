import { describe, expect, test, beforeAll, afterAll } from '@jest/globals'
import { config } from 'dotenv'
import { join } from 'path'

// Load test environment variables
config({
    path: join(process.cwd(), '.env.test')
})

// Import sql after loading environment variables
const sql = (async () => {
    const { default: sql } = await import('../connection')
    return sql
})()

describe('Database Connection Tests', () => {
    beforeAll(async () => {
        // Add any setup code here
    })

    afterAll(async () => {
        // Close the database connection
        const db = await sql
        await db.end()
    })

    test('should connect to the database', async () => {
        // Test a simple query
        const db = await sql
        const result = await db`SELECT 1 + 1 AS sum`
        expect(result[0].sum).toBe(2)
    })

    test('should handle query errors', async () => {
        const db = await sql
        // Try to query a non-existent table
        await expect(db`SELECT * FROM nonexistent_table`).rejects.toThrow()
    })
})
