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
        console.log('✅ Successfully processed transaction:', message.txid);
    } else if (message.type === 'error') {
        console.error('❌ Error processing transaction:', message);
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
    console.log("📥 TRANSACTION", JSON.stringify(tx, null, 2));
    
    try {
        // Fetch full transaction data
        const fullTx = await fetchTransaction(tx.id);
        console.log("🔍 Full transaction data:", {
            txid: fullTx.id,
            outputs: fullTx.outputs?.length || 0,
            block_height: fullTx.block_height
        });
        
        // Parse MAP data using our new parser
        const parsedData = parseMapTransaction(fullTx);
        if (!parsedData) {
            console.log('⏭️ No valid MAP data found in transaction:', tx.id);
            return;
        }

        console.log("✨ Found MAP data:", {
            txid: parsedData.txid,
            is_vote: parsedData.is_vote,
            has_image: !!parsedData.raw_image_data || !!parsedData.image_source,
            vote_options: parsedData.vote_options.length
        });

        // Send to worker for processing
        dbWorker.postMessage({
            type: 'process_transaction',
            transaction: parsedData
        });

    } catch (error) {
        console.error('❌ Transaction processing error:', {
            txid: tx.id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

const onStatus = function(message: any) {
    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
        console.log("✅ BLOCK DONE", message.block);
    } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
        console.log("⏳ WAITING FOR NEW BLOCK...", message);
    } else if (message.statusCode === ControlMessageStatusCode.REORG) {
        console.log("⚠️ REORG TRIGGERED", message);
    } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
        console.error("❌ ERROR", message);
    }
};

const onError = function(err: any) {
    console.error("❌ ERROR:", err);
};

const onMempool = function(tx: any) {
    console.log("💭 MEMPOOL TRANSACTION:", tx.id);
    onPublish(tx); // Process mempool transactions the same way
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
                console.log("🔗 CONNECTED", ctx);
            },
            onConnecting(ctx: any) {
                console.log("🔄 CONNECTING", ctx);
            },
            onDisconnected(ctx: any) {
                console.log("❌ DISCONNECTED", ctx);
            },
            onError(ctx: any) {
                console.error("❌ ERROR:", ctx);
            },
        });

        this.dbWorker = dbWorker;
    }

    async start() {
        try {
            console.log('🚀 Starting unified scanner from block 883800...');
            await this.client.Subscribe(
                "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
                883800,
                onPublish,
                onStatus,
                onError,
                onMempool
            );

            console.log('✅ Subscription started successfully');
        } catch (error) {
            console.error("❌ Error starting subscription:", error);
            process.exit(1);
        }
    }

    async stop() {
        try {
            console.log('🛑 Shutting down scanner...');
            
            // Clean up database connections
            await prisma.$disconnect();
            console.log('✅ Database disconnected');

            if (this.client) {
                try {
                    await this.client.Disconnect();
                    console.log('✅ JungleBus client disconnected');
                } catch (error) {
                    console.error('❌ Error disconnecting JungleBus client:', error);
                }
            }
            
            if (this.dbWorker) {
                try {
                    // Send shutdown signal to worker
                    this.dbWorker.postMessage({ type: 'shutdown' });
                    await this.dbWorker.terminate();
                    console.log('✅ Database worker terminated');
                } catch (error) {
                    console.error('❌ Error terminating database worker:', error);
                }
            }
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
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