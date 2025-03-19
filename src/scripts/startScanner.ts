/**
 * Scanner Startup Script
 * 
 * This script starts the blockchain scanner that looks for lockd.app transactions
 */

import { scanner } from '../services/scanner.js';
import logger from '../services/logger.js';

async function main() {
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

    try {
        // Parse command line arguments for start block
        let startBlock: number | undefined = undefined;
        
        // Check for --start-block argument
        const startBlockArg = process.argv.find(arg => arg.startsWith('--start-block=') || arg === '--start-block');
        if (startBlockArg) {
            if (startBlockArg === '--start-block' && process.argv.length > process.argv.indexOf(startBlockArg) + 1) {
                // Format: --start-block 123456
                const blockValue = process.argv[process.argv.indexOf(startBlockArg) + 1];
                startBlock = parseInt(blockValue, 10);
            } else if (startBlockArg.startsWith('--start-block=')) {
                // Format: --start-block=123456
                const blockValue = startBlockArg.split('=')[1];
                startBlock = parseInt(blockValue, 10);
            }
            
            if (startBlock && !isNaN(startBlock)) {
                logger.info(`🔄 Using custom start block: ${startBlock}`);
            } else {
                logger.warn('⚠️ Invalid start block specified, using default');
                startBlock = undefined;
            }
        }
        
        // Start the scanner with the specified start block
        await scanner.start(startBlock);
        logger.info('Scanner started successfully');
    } catch (error) {
        logger.error(`Failed to start scanner: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

main();
