import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { JungleBusTransaction, ControlMessage } from '../types';
import { PrismaClient } from '@prisma/client';
import { TransactionParser } from './parser';
import axios from 'axios';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
});

// Test database connection
prisma.$connect()
    .then(() => {
        console.log('Successfully connected to the database');
    })
    .catch((error) => {
        console.error('Failed to connect to the database:', error);
    });

async function fetchTransaction(txId: string): Promise<any> {
    const url = `https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txId}`;
    const response = await axios.get(url);
    return response.data;
}

// Create JungleBus client
const client = new JungleBusClient("junglebus.gorillapool.io", {
    useSSL: true,
    protocol: "json",
    onConnected(ctx) {
        console.log("CONNECTED", ctx);
    },
    onConnecting(ctx) {
        console.log("CONNECTING", ctx);
    },
    onDisconnected(ctx) {
        console.log("DISCONNECTED", ctx);
    },
    onError(ctx) {
        console.error(ctx);
    },
});

// Create a worker for database operations
const dbWorker = new Worker(path.join(__dirname, 'dbWorker.js'));

// Handle messages from the worker
dbWorker.on('message', (message) => {
    console.log('Database worker message:', JSON.stringify(message, null, 2));
});

// Handle worker errors
dbWorker.on('error', (error) => {
    console.error('Database worker error:', error);
});

// Handle worker exit
dbWorker.on('exit', (code) => {
    if (code !== 0) {
        console.error(`Database worker stopped with exit code ${code}`);
    }
});

const onPublish = function(tx: any) {
    console.log("TRANSACTION", JSON.stringify(tx, null, 2));
    // Send transaction to worker for processing
    dbWorker.postMessage({ type: 'process_transaction', transaction: tx });
};

const onStatus = function(message: any) {
    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
        console.log("BLOCK DONE", message.block);
    } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
        console.log("WAITING FOR NEW BLOCK...", message);
    } else if (message.statusCode === ControlMessageStatusCode.REORG) {
        console.log("REORG TRIGGERED", message);
    } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
        console.error(message);
    }
};

const onError = function(err: any) {
    console.error(err);
};

const onMempool = function(tx: any) {
    console.log("MEMPOOL TRANSACTION", JSON.stringify(tx, null, 2));
    // Send mempool transaction to worker for processing
    dbWorker.postMessage({ type: 'process_transaction', transaction: tx });
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    try {
        await client.Disconnect();
        dbWorker.terminate();
        console.log('Shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start the subscription
export async function startVoteSubscription() {
    try {
        console.log('Starting subscription from block 720000...');
        await client.Subscribe(
            "436d4681e23186b369291cf3e494285724964e92f319de5f56b6509d32627693",
            720000,
            onPublish,
            onStatus,
            onError,
            onMempool
        );
    } catch (error) {
        console.error("Error starting subscription:", error);
        process.exit(1);
    }
} 