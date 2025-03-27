/**
 * Scanner Startup Script
 * 
 * This script starts the blockchain scanner that looks for lockd.app JSON ordinal inscriptions
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
        await scanner.start();
        logger.info('Scanner started successfully - watching for JSON ordinal inscriptions');
    } catch (error) {
        logger.error(`Failed to start scanner: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

main();
