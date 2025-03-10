/**
 * Script to check if transactions are being saved in the database
 */
import { DbClient } from '../db/index.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

async function checkTransactions() {
    try {
        logger.info('Checking transactions in the database...');
        
        // Use a fresh Prisma client directly
        const prisma = new PrismaClient({
            datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
            log: [
                { level: 'error', emit: 'stdout' },
                { level: 'warn', emit: 'stdout' },
            ],
        });
        
        try {
            // Count transactions in the database
            const count = await prisma.processed_transaction.count();
            logger.info(`Found ${count} transactions in the database`);
            
            // Get the 5 most recent transactions
            const recentTxs = await prisma.processed_transaction.findMany({
                take: 5,
                orderBy: {
                    created_at: 'desc'
                }
            });
            
            logger.info('Recent transactions:', {
                count: recentTxs.length,
                transactions: recentTxs.map(tx => ({
                    tx_id: tx.tx_id,
                    type: tx.type,
                    created_at: tx.created_at,
                    block_height: tx.block_height
                }))
            });
            
            // Also check votes-related transactions
            const voteTxs = await prisma.processed_transaction.findMany({
                where: {
                    type: 'vote'
                },
                take: 5,
                orderBy: {
                    created_at: 'desc'
                }
            });
            
            logger.info('Recent vote transactions:', {
                count: voteTxs.length,
                transactions: voteTxs.map(tx => ({
                    tx_id: tx.tx_id,
                    type: tx.type,
                    created_at: tx.created_at
                }))
            });
        } finally {
            // Always disconnect the Prisma client when done
            await prisma.$disconnect().catch(err => {
                logger.warn('Error disconnecting prisma client', {
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            });
        }
        
        logger.info('Transaction check completed');
    } catch (error) {
        logger.error('Transaction check failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
    }
}

// Run the check
checkTransactions().catch(error => {
    logger.error('Unhandled error in check script', {
        error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
});
