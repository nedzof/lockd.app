import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function processTransaction(transaction) {
    try {
        console.log('Processing transaction:', transaction.txid);
        // Add your transaction processing logic here
        
        parentPort.postMessage({
            type: 'transaction_processed',
            txid: transaction.txid
        });
    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            error: error.message,
            txid: transaction.txid
        });
    }
}

parentPort.on('message', async (message) => {
    if (message.type === 'process_transaction') {
        await processTransaction(message.transaction);
    } else if (message.type === 'shutdown') {
        await prisma.$disconnect();
        process.exit(0);
    }
}); 