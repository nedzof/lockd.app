import { DBTransactionProcessor } from './transactionProcessor';

// Initialize database worker service
const dbWorker = new DBTransactionProcessor();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    await dbWorker.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    await dbWorker.disconnect();
    process.exit(0);
});

export default dbWorker;
