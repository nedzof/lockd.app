import { Scanner } from '../services/scanner';
import { logger } from '../utils/logger';

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
