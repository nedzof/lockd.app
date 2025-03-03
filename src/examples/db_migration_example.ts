/**
 * This example shows how to migrate from the old DbClient to the new modular DB clients
 * 
 * Migration approach:
 * 1. The old DbClient.ts now includes deprecation warnings
 * 2. It directly delegates calls to the new db_client implementation
 * 3. Eventually, all code should be updated to use the new architecture directly
 */

// Old approach (deprecated)
import { DbClient } from '../services/dbClient.js';

// New approach (recommended)
import { db_client } from '../db/index.js';
import { ParsedTransaction } from '../shared/types.js';

async function exampleUsage() {
    // Sample transaction data
    const sample_tx: ParsedTransaction = {
        tx_id: 'example-tx-id',
        type: 'post',
        metadata: {
            post_txid: 'post-tx-id',
            content: 'Hello, world!',
            vote_options: ['Option 1', 'Option 2']
        },
        block_height: 123456,
        block_time: '2023-01-01T00:00:00Z'
    };

    // -------------------------------------------
    // OLD APPROACH (deprecated) - Using singleton
    // -------------------------------------------
    
    // Get instance of the old DbClient
    const old_db_client = DbClient.get_instance();
    
    // Process a transaction the old way
    await old_db_client.processTransaction(sample_tx);
    
    // Get a transaction the old way
    const tx = await old_db_client.getTransaction('tx-id');
    
    // Get current block height the old way
    const height = await old_db_client.getCurrentBlockHeight();
    
    
    // -------------------------------------------
    // NEW APPROACH - Using modular architecture
    // -------------------------------------------
    
    // The db_client is already initialized and exported as a singleton
    
    // Process a transaction the new way
    await db_client.process_transaction(sample_tx);
    
    // Process multiple transactions in a batch
    await db_client.process_transaction_batch([sample_tx]);
    
    // Get a transaction the new way
    const new_tx = await db_client.get_transaction('tx-id');
    
    // Get a post with its vote options
    const post = await db_client.get_post('post-tx-id', true);
    
    // Get locks for a post
    const locks = await db_client.get_locks_for_target('post-tx-id');
    
    // Get current block height the new way
    const current_height = await db_client.get_current_block_height();
}

// Export for demonstration purposes
export { exampleUsage };
