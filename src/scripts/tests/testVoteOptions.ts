import { DbClient } from '../services/dbClient.js';
import { ParsedTransaction } from '../shared/types.js';
import { logger } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';

async function testVoteOptions() {
    try {
        logger.info('Starting vote options test');
        
        // Create a test transaction with vote options
        const testTx: ParsedTransaction = {
            tx_id: `test-vote-tx-${Date.now()}`,
            protocol: 'MAP',
            type: 'vote',
            block_height: 885675,
            block_time: BigInt(Date.now()),
            metadata: {
                post_id: `test-vote-post-${Date.now()}`,
                content: 'This is a test vote post',
                sender_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                author_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                is_vote: true,
                vote_question: 'What is your favorite color?',
                vote_options: ['Red', 'Green', 'Blue', 'Yellow'],
                content_type: 'vote',
                tags: ['test', 'vote']
            }
        };
        
        logger.info('Created test vote transaction', { 
            tx_id: testTx.tx_id,
            vote_options: testTx.metadata.vote_options 
        });
        
        // Process the transaction
        const dbClient = DbClient.getInstance();
        
        // Save the transaction first
        const savedTx = await dbClient.saveTransaction(testTx);
        logger.info('Transaction saved', { tx_id: savedTx.tx_id });
        
        // Process the transaction to create post and vote options
        const post = await dbClient.processTransaction(testTx);
        
        logger.info('Test vote post created', { 
            post_id: post.id,
            is_vote: post.isVote
        });
        
        // Check if vote options were created
        try {
            // Create a direct Prisma client to query the database
            const prisma = new PrismaClient();
            
            try {
                // Query the database directly to check for vote options
                const voteOptions = await prisma.vote_option.findMany({
                    where: {
                        post_id: post.id
                    }
                });
                
                if (voteOptions && voteOptions.length > 0) {
                    logger.info('Vote options successfully created', {
                        post_id: post.id,
                        vote_options_count: voteOptions.length,
                        vote_options: voteOptions.map(opt => opt.content)
                    });
                } else {
                    logger.error('No vote options found in database', {
                        post_id: post.id
                    });
                }
            } finally {
                // Always disconnect the client when done
                await prisma.$disconnect();
            }
        } catch (error) {
            logger.error('Error querying vote options', {
                error: error instanceof Error ? error.message : 'Unknown error',
                post_id: post.id
            });
        }
        
        logger.info('Vote options test completed');
        
        // Exit cleanly
        process.exit(0);
    } catch (error) {
        logger.error('Vote options test failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
    }
}

// Run the test
testVoteOptions().catch(err => {
    logger.error('Unhandled error in test', {
        error: err instanceof Error ? err.message : 'Unknown error'
    });
    process.exit(1);
});
