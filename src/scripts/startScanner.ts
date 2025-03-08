import { Scanner } from '../services/scanner';
import { logger } from '../utils/logger';
import { CONFIG } from '../services/config';
import { junglebus_service } from '../services/junglebus_service';

async function main() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const startBlock = args.length > 0 ? parseInt(args[0], 10) : CONFIG.DEFAULT_START_BLOCK;
        const shouldCleanup = process.env.CLEANUP_DB === 'true';
        
        logger.info('Starting scanner with configuration', {
            start_block: startBlock,
            cleanup_db: shouldCleanup,
            subscription_id: CONFIG.JB_SUBSCRIPTION_ID
        });
        
        // Fetch subscription details to verify it exists
        try {
            const subscriptionDetails = await junglebus_service.fetchSubscriptionDetails();
            if (subscriptionDetails) {
                logger.info('Found JungleBus subscription', {
                    subscription_id: CONFIG.JB_SUBSCRIPTION_ID,
                    details: subscriptionDetails
                });
            } else {
                logger.warn('Could not verify JungleBus subscription, but will continue anyway', {
                    subscription_id: CONFIG.JB_SUBSCRIPTION_ID
                });
            }
        } catch (error) {
            logger.warn('Error fetching subscription details, but will continue anyway', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        
        // Create scanner with specified configuration
        const scanner = new Scanner({
            startBlock: startBlock,
            logLevel: process.env.LOG_LEVEL || 'info'
        });
        
        // Clean up the database if requested
        if (shouldCleanup) {
            logger.info('Cleaning up database before starting scanner...');
            try {
                const result = await scanner.cleanup_database();
                logger.info('Database cleanup completed successfully', {
                    deleted_lock_likes: result.lock_likes,
                    deleted_vote_options: result.vote_options,
                    deleted_posts: result.posts,
                    deleted_transactions: result.transactions,
                    total_deleted_records: result.lock_likes + result.vote_options + result.posts + result.transactions
                });
            } catch (error) {
                logger.error('Failed to clean up database', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
                process.exit(1);
            }
        }
        
        // Set up signal handlers for graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT. Shutting down...');
            await scanner.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM. Shutting down...');
            await scanner.stop();
            process.exit(0);
        });

        // Start the scanner
        await scanner.start();
        logger.info('Scanner started successfully and is now running');
        
        // Log status periodically
        setInterval(() => {
            const status = scanner.get_status();
            logger.info('Scanner status', status);
        }, 60000); // Every minute
        
    } catch (error) {
        logger.error('Failed to start scanner', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    logger.error('Unhandled error in main function', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
});
