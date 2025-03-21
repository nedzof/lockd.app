import { TransactionParser } from "./parser";
import { DbClient } from "./dbClient";
import { logger } from "../utils/logger";

// This script tests the transaction parser with a real vote transaction
async function testVoteTransaction() {
    try {
        // Create instances
        const dbClient = new DbClient();
        const parser = new TransactionParser(dbClient);
        
        // Sample transaction ID with vote data
        // You can replace this with any transaction ID that contains vote data
        const tx_id = "5186d7ed67331b2a8c87a1d687a655796f46fc481532bf54afe3f2fb77d8d75e";
        
        logger.info('Starting vote transaction test', { tx_id });
        
        // Parse the transaction
        await parser.parseTransaction(tx_id);
        
        // Fetch the saved transaction to verify
        const savedTx = await dbClient.get_transaction(tx_id);
        
        if (savedTx) {
            logger.info('Successfully retrieved transaction', { 
                tx_id,
                metadata: savedTx.metadata,
                is_vote: savedTx.metadata.is_vote,
                vote_question: savedTx.metadata.vote_question,
                vote_options: savedTx.metadata.vote_options
            });
        } else {
            logger.error('Transaction not found after parsing', { tx_id });
        }
    } catch (error) {
        logger.error('Test failed', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// Run the test
testVoteTransaction().then(() => {
    logger.info('Test completed');
    process.exit(0);
}).catch(error => {
    logger.error('Test failed with uncaught error', {
        error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
});
