import { Scanner } from '../services/scanner';
import { logger } from '../utils/logger';
import { DbClient } from '../services/dbClient';
import { TransactionParser } from '../services/parser';

async function main() {
    const dbClient = DbClient.getInstance();
    const parser = new TransactionParser(dbClient);
    const scanner = new Scanner(parser, dbClient);
    
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
