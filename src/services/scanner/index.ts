import { TransactionScanner } from './transactionScanner';
import { ScannerConfig } from './scannerTypes';

// Initialize scanner service
const config: ScannerConfig = {
    jungleBusUrl: process.env.JUNGLEBUS_URL || 'https://junglebus.gorillapool.io/v1/transaction/get/',
    startHeight: parseInt(process.env.START_HEIGHT || '0', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '100', 10)
};

const scanner = new TransactionScanner(config);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    await scanner.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    await scanner.disconnect();
    process.exit(0);
});

export default scanner;
