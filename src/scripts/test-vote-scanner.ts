import { logger } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { VoteTransactionService } from '../services/vote-transaction-service.js';
import { TransactionDataParser } from '../parser/transaction_data_parser.js';

/**
 * Test script to verify vote transaction processing without using the full Scanner
 * This script loads example vote transactions and processes them directly with VoteTransactionService
 */
async function testVoteProcessing() {
    logger.info('🧪 Starting vote transaction processing test');
    
    // Initialize services
    const prisma = new PrismaClient();
    const voteService = new VoteTransactionService(prisma);
    const txDataParser = new TransactionDataParser();
    
    try {
        // Load example transactions
        const exampleTxs = loadExampleTransactions();
        
        if (!exampleTxs || exampleTxs.length === 0) {
            logger.error('❌ No example transactions found');
            return;
        }
        
        logger.info(`📋 Loaded ${exampleTxs.length} example transactions`);
        
        // Process each transaction
        for (const tx of exampleTxs) {
            try {
                const txId = tx.id || tx.tx_id;
                logger.info(`🔍 Processing transaction ${txId}`);
                
                // Process the vote transaction directly
                const result = await voteService.processVoteTransaction(tx);
                
                if (result) {
                    logger.info('✅ Vote transaction processed successfully', {
                        tx_id: txId,
                        post_id: result.post.id,
                        options_count: result.voteOptions.length
                    });
                } else {
                    logger.warn('⚠️ Vote transaction processing failed', { tx_id: txId });
                }
            } catch (error) {
                logger.error('❌ Error processing test transaction', {
                    tx_id: tx.id || tx.tx_id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        // Check the database for results
        await checkVoteResults(prisma);
        
        logger.info('✅ Vote transaction test completed');
    } finally {
        // Clean up Prisma client
        await prisma.$disconnect();
    }
}

/**
 * Load example transactions from a JSON file
 */
function loadExampleTransactions() {
    try {
        // Try to load from examples directory
        const examplesPath = path.resolve(process.cwd(), 'examples', 'vote-transactions.json');
        
        if (fs.existsSync(examplesPath)) {
            const data = fs.readFileSync(examplesPath, 'utf8');
            return JSON.parse(data);
        }
        
        // Fallback to hardcoded example
        return [
            {
                id: '8ee0654e57143665976bb24b4c443c4e8a781aa32b2182cb2d23205e4d97c50e',
                data: [
                    'app=lockd.app',
                    'cmd=set',
                    'content=1 feb 27',
                    'is_vote=true',
                    'options_hash=185d86abe64b3e7c678b117fbaff0eca3e6ee6a4b27da1e693b635f25a76f3b3',
                    'post_id=m7nqz0mz-zqoju589d'
                ]
            }
        ];
    } catch (error) {
        logger.error('❌ Error loading example transactions', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return [];
    }
}

/**
 * Check the database for vote results
 */
async function checkVoteResults(prisma: PrismaClient) {
    try {
        // Query for vote posts
        const votePosts = await prisma.post.findMany({
            where: {
                is_vote: true
            },
            include: {
                vote_options: true
            }
        });
        
        logger.info(`📊 Found ${votePosts.length} vote posts in database`);
        
        // Log details of each vote post
        for (const post of votePosts) {
            logger.info(`🗳️ Vote post details`, {
                post_id: post.id,
                content: post.content,
                options_count: post.vote_options.length,
                options: post.vote_options.map(opt => ({
                    id: opt.id,
                    content: opt.content,
                    index: opt.option_index
                }))
            });
        }
    } catch (error) {
        logger.error('❌ Error checking vote results', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

// Run the test if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
    testVoteProcessing().catch(error => {
        logger.error('❌ Test failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
    });
}
