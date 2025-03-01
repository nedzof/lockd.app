import { DbClient } from './dbClient.js';
import { TransactionParser } from './parser.js';
import { Scanner } from './scanner.js';
import { logger } from '../utils/logger.js';

async function main() {
    try {
        logger.info('Starting scanner test');
        
        // Initialize services
        const dbClient = new DbClient();
        const parser = new TransactionParser(dbClient);
        const scanner = new Scanner(parser, dbClient);
        
        // Start the scanner
        await scanner.start();
        
        // Keep the process running
        logger.info('Scanner is running. Press Ctrl+C to stop.');
    } catch (error) {
        logger.error('Error in scanner test', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    logger.error('Unhandled error in main', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
});
