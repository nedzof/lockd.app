import { Scanner } from '../services/scanner.js';
import { logger } from '../utils/logger.js';

async function main() {
    const scanner = new Scanner();
    
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
        logger.info('Scanner started successfully');
    } catch (error) {
        logger.error('Failed to start scanner', { error });
        process.exit(1);
    }
}

main();
