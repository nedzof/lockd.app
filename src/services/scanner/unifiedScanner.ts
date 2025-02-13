import { JungleBusClient, Transaction as JungleBusTransaction, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import type { JungleBusTransaction as JungleBusTransactionType } from './types';
import axios from 'axios';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMapTransaction } from './mapTransactionParser';
import prisma from '../../db';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
        console.log("FULL TX OUTPUTS:", JSON.stringify(fullTx.outputs, null, 2));
        
        // Get author address from the transaction outputs
        const author_address = fullTx.addresses?.[0];

        if (!author_address) {
            console.error('Could not extract author address from transaction:', tx.id);
            console.log('Transaction addresses:', JSON.stringify(fullTx.addresses, null, 2));
            return;
        }

        // Extract raw MAP data from outputs with more detailed logging
        const mapData: string[] = [];
        console.log("Processing outputs for MAP data...");
        for (const output of fullTx.outputs || []) {
            if (!output.script?.asm) {
                console.log("Skipping output without script ASM");
                continue;
            }
            const scriptData = output.script.asm;
            console.log("Processing script ASM:", scriptData);
            
            // Extract MAP fields
            const mapFields = scriptData.matchAll(/MAP_([A-Z_]+)=([^|]+)/gi);
            for (const match of mapFields) {
                const [_, key, value] = match;
                const mapEntry = `map_${key.toLowerCase()}=${value}`;
                console.log("Found MAP field:", mapEntry);
                mapData.push(mapEntry);
            }

            // Extract content
            const contentMatch = scriptData.match(/content=([^|]+)/i);
            if (contentMatch) {
                console.log("Found content:", contentMatch[1]);
                mapData.push(`content=${contentMatch[1]}`);
            }
        }

        console.log("Final MAP data:", mapData);

        // Send to worker for database processing
        dbWorker.postMessage({
            type: 'process_transaction',
            transaction: {
                txid: tx.id,
                data: mapData,
                block_height: tx.block_height || 0,
                author_address
            }
        });
    } catch (error) {
        console.error("Error processing transaction:", error);
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