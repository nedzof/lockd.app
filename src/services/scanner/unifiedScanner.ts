import { JungleBusClient, Transaction as JungleBusTransaction, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import type { JungleBusTransaction as JungleBusTransactionType } from './types';
import axios from 'axios';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMapTransaction } from './mapTransactionParser.js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a worker for database operations
const dbWorker = new Worker(join(__dirname, 'unifiedDbWorker.js'));

// Handle messages from the worker
dbWorker.on('message', (message) => {
    if (message.type === 'transaction_processed') {
        console.log('Database worker message:', message);
    } else if (message.type === 'error') {
        console.error('Database worker error:', message);
    }
});

// Helper function to fetch transaction data
async function fetchTransaction(txid: string): Promise<any> {
    try {
        const response = await axios.get(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching transaction:', error);
        throw error;
    }
}

const onPublish = async function(tx: JungleBusTransactionType) {
    console.log("TRANSACTION", JSON.stringify(tx, null, 2));
    
    try {
        // Fetch full transaction data
        const fullTx = await fetchTransaction(tx.id);
        
        // Parse MAP data using our new parser
        const parsedData = parseMapTransaction(fullTx);
        if (!parsedData) {
            console.log('No valid MAP data found in transaction:', tx.id);
            return;
        }

        // Save to database using Prisma
        await prisma.post.create({
            data: {
                id: parsedData.txid,
                txid: parsedData.txid,
                content: parsedData.content,
                author_address: parsedData.author_address,
                media_type: parsedData.media_type,
                block_height: parsedData.block_height,
                amount: parsedData.amount,
                unlock_height: parsedData.unlock_height,
                description: parsedData.description,
                tags: parsedData.tags,
                metadata: parsedData.metadata,
                is_locked: parsedData.is_locked,
                lock_duration: parsedData.lock_duration,
                raw_image_data: parsedData.raw_image_data,
                image_format: parsedData.image_format,
                image_source: parsedData.image_source,
                is_vote: parsedData.is_vote,
                vote_options: {
                    create: parsedData.vote_options.map(option => ({
                        txid: option.txid,
                        content: option.content,
                        author_address: option.author_address,
                        created_at: option.created_at,
                        lock_amount: option.lock_amount,
                        lock_duration: option.lock_duration,
                        unlock_height: option.unlock_height,
                        current_height: option.current_height,
                        lock_percentage: option.lock_percentage,
                        tags: option.tags
                    }))
                }
            }
        });

        console.log('Successfully saved MAP data for transaction:', tx.id);
    } catch (error) {
        console.error('Error processing transaction:', error);
    }
};

// Export the scanner class
export default class UnifiedScanner {
    private client: JungleBusClient;
    private dbWorker: Worker;

    constructor() {
        this.client = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: "json",
            onConnected(ctx: any) {
                console.log("CONNECTED", ctx);
            },
            onConnecting(ctx: any) {
                console.log("CONNECTING", ctx);
            },
            onDisconnected(ctx: any) {
                console.log("DISCONNECTED", ctx);
            },
            onError(ctx: any) {
                console.error(ctx);
            },
        });

        // Create a worker for database operations
        this.dbWorker = new Worker(join(__dirname, 'unifiedDbWorker.js'));

        // Handle messages from the worker
        this.dbWorker.on('message', (message) => {
            if (message.type === 'transaction_processed') {
                console.log('Database worker message:', message);
            } else if (message.type === 'error') {
                console.error('Database worker error:', message);
            }
        });
    }

    async start() {
        try {
            console.log('Starting unified scanner from block 883819...');
            await this.client.Subscribe(
                "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
                883819,
                onPublish,
                (message: any) => {
                    if (message.statusCode === ControlMessageStatusCode.WAITING) {
                        console.log("WAITING FOR NEW BLOCK...", message);
                    } else if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                        console.log("BLOCK DONE", message);
                    } else if (message.statusCode === ControlMessageStatusCode.REORG) {
                        console.log("REORG", message);
                    }
                },
                (error: any) => {
                    console.error("ERROR", error);
                }
            );

            console.log('Subscription started successfully');
        } catch (error) {
            console.error("Error starting subscription:", error);
            process.exit(1);
        }
    }

    async stop() {
        try {
            if (this.client) {
                try {
                    await this.client.Disconnect();
                    console.log('JungleBus client disconnected');
                } catch (error) {
                    console.error('Error disconnecting JungleBus client:', error);
                }
            }
            
            if (this.dbWorker) {
                try {
                    await this.dbWorker.terminate();
                    console.log('Database worker terminated');
                } catch (error) {
                    console.error('Error terminating database worker:', error);
                }
            }
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Create and start the scanner
const scanner = new UnifiedScanner();
scanner.start();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await scanner.stop();
    process.exit(0);
}); 