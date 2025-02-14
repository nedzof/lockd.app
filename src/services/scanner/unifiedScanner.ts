import { JungleBusClient, Transaction as JungleBusTransaction, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import type { JungleBusTransaction as JungleBusTransactionType } from './types';
import type { ParsedPost } from './types';
import axios from 'axios';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMapTransaction } from './mapTransactionParser.js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Set up logging to file
const logFile = path.join(process.cwd(), 'scanner.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Override console.log and console.error to write to both console and file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ')}`;
    
    logStream.write(message + '\n');
    originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ERROR: ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ')}`;
    
    logStream.write(message + '\n');
    originalConsoleError.apply(console, args);
};

// Clean up logging on process exit
process.on('exit', () => {
    logStream.end();
});

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a worker for database operations
const workerPath = join(__dirname, 'unifiedDbWorker.ts');
console.log(`📂 Creating database worker from: ${workerPath}`);

// Verify worker file exists
if (!fs.existsSync(workerPath)) {
    console.error(`❌ Worker file not found at: ${workerPath}`);
    process.exit(1);
}

// Use child process with ts-node
const dbWorker = fork(workerPath, [], {
    execArgv: ['--loader', 'ts-node/esm']
});

export default class UnifiedScanner {
    private client: JungleBusClient;
    private dbWorker: any;
    private pendingTransactions: Map<string, number>;
    private workerAvailable: boolean;
    private startTime: number;

    constructor() {
        console.log('🚀 Initializing UnifiedScanner...');
        this.client = new JungleBusClient(process.env.JUNGLEBUS_URL || 'https://junglebus.gorillapool.io');
        console.log('✅ JungleBus client initialized');
        
        this.dbWorker = dbWorker;
        this.pendingTransactions = new Map();
        this.workerAvailable = true;
        this.startTime = Date.now();

        // Set up worker message handling with enhanced validation
        this.dbWorker.on('message', (message: any) => {
            if (!message || !message.type) {
                console.error('❌ Received invalid message from worker:', message);
                return;
            }

            if (message.type === 'transaction_processed') {
                const processingTime = Date.now() - (this.pendingTransactions.get(message.txid) || 0);
                this.pendingTransactions.delete(message.txid);
                this.workerAvailable = true;
                console.log(`✅ Transaction processed successfully:`, {
                    txid: message.txid,
                    processingTime: `${processingTime}ms`,
                    queueSize: this.pendingTransactions.size
                });
            } else if (message.type === 'error') {
                const processingTime = Date.now() - (this.pendingTransactions.get(message.error.txid) || 0);
                this.pendingTransactions.delete(message.error.txid);
                this.workerAvailable = true;
                console.error(`❌ Worker reported error:`, {
                    txid: message.error.txid,
                    error: message.error,
                    processingTime: `${processingTime}ms`,
                    queueSize: this.pendingTransactions.size
                });
            }
        });

        // Handle worker errors
        this.dbWorker.on('error', (error: Error) => {
            console.error('❌ Worker error:', error);
        });

        // Handle worker exit
        this.dbWorker.on('exit', (code: number) => {
            console.error(`❌ Worker exited with code ${code}`);
            process.exit(1);
        });
    }

    private async sendToWorkerWithBackpressure(parsedData: ParsedPost) {
        const MAX_QUEUE = 100;
        console.log(`\n🔄 Attempting to send transaction to worker:`, {
            txid: parsedData.txid,
            queueSize: this.pendingTransactions.size,
            maxQueue: MAX_QUEUE
        });

        if (this.pendingTransactions.size >= MAX_QUEUE) {
            console.warn('⚠️ Worker queue full, dropping TX:', parsedData.txid);
            return;
        }

        console.log(`⏳ Waiting for worker availability...`);
        while (!this.workerAvailable) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.pendingTransactions.set(parsedData.txid, Date.now());
        this.workerAvailable = false;
        
        console.log(`📤 Sending transaction to worker:`, {
            txid: parsedData.txid,
            queueSize: this.pendingTransactions.size
        });

        this.dbWorker.send({
            type: 'process_transaction',
            data: parsedData
        });
    }

    async onPublish(tx: any) {
        console.log("\n📥 Received new transaction:", {
            txid: tx.id,
            timestamp: new Date().toISOString()
        });
        
        try {
            console.log(`🔍 Fetching full transaction data for ${tx.id}`);
            const fullTx = await fetchTransaction(tx.id);
            console.log("✅ Transaction data retrieved:", {
                txid: fullTx.id,
                outputs: fullTx.outputs?.length || 0,
                block_height: fullTx.block_height
            });
            
            console.log(`🔍 Parsing MAP data from transaction ${fullTx.id}`);
            const parsedData = await parseMapTransaction(fullTx);
            if (!parsedData) {
                console.log('⏭️ No valid MAP data found, skipping transaction:', tx.id);
                return;
            }

            console.log("✨ Successfully parsed MAP data:", {
                txid: parsedData.txid,
                hasVote: !!parsedData.vote,
                hasImage: parsedData.images.length > 0,
                voteOptions: parsedData.vote?.options?.length || 0,
                timestamp: parsedData.timestamp
            });

            // Use backpressure-managed send
            await this.sendToWorkerWithBackpressure(parsedData);

        } catch (error) {
            console.error('❌ Transaction processing error:', {
                txid: tx.id,
                error: error instanceof Error ? {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                } : 'Unknown error'
            });
        }
    }

    async start() {
        try {
            console.log('\n🚀 Starting unified scanner...');
            console.log('📊 Scanner status:', {
                startBlock: 883800,
                jungleBusUrl: process.env.JUNGLEBUS_URL || 'https://junglebus.gorillapool.io',
                pendingTransactions: this.pendingTransactions.size,
                uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`
            });

            await this.client.Subscribe(
                "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
                883800,
                this.onPublish.bind(this),
                this.onStatus.bind(this),
                this.onError.bind(this),
                this.onMempool.bind(this)
            );

            console.log('✅ JungleBus subscription started successfully');
        } catch (error) {
            console.error("❌ Error starting subscription:", error);
            process.exit(1);
        }
    }

    async stop() {
        console.log('\n🛑 Stopping scanner...');
        
        // Wait for pending transactions to complete
        if (this.pendingTransactions.size > 0) {
            console.log(`⏳ Waiting for ${this.pendingTransactions.size} pending transactions to complete...`);
            
            while (this.pendingTransactions.size > 0) {
                console.log(`📊 Remaining transactions: ${this.pendingTransactions.size}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log('🔌 Disconnecting from JungleBus...');
        await this.client.Disconnect();
        
        console.log('👋 Waiting for worker to exit...');
        await new Promise(resolve => this.dbWorker.once('exit', resolve));
        
        console.log('✅ Scanner stopped successfully');
    }

    private onStatus(message: any) {
        const statusMessages: Record<number, string> = {
            [ControlMessageStatusCode.BLOCK_DONE]: "✅ BLOCK PROCESSED",
            [ControlMessageStatusCode.WAITING]: "⏳ WAITING FOR NEW BLOCK",
            [ControlMessageStatusCode.REORG]: "⚠️ BLOCKCHAIN REORG DETECTED",
            [ControlMessageStatusCode.ERROR]: "❌ JUNGLEBUS ERROR"
        };

        const status = statusMessages[message.statusCode] || "❓ UNKNOWN STATUS";
        console.log(`${status}:`, {
            statusCode: message.statusCode,
            block: message.block,
            timestamp: new Date().toISOString(),
            pendingTransactions: this.pendingTransactions.size,
            uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`
        });
    }

    private onError(err: any) {
        console.error("❌ JungleBus error:", {
            error: err instanceof Error ? {
                message: err.message,
                name: err.name,
                stack: err.stack
            } : err,
            timestamp: new Date().toISOString(),
            pendingTransactions: this.pendingTransactions.size
        });
    }

    private onMempool(tx: any) {
        console.log("💭 MEMPOOL TRANSACTION:", {
            txid: tx.id,
            timestamp: new Date().toISOString()
        });
        this.onPublish(tx); // Process mempool transactions the same way
    }
}

// Create and start the scanner
console.log('\n🎬 Initializing scanner process...');
const scanner = new UnifiedScanner();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n📣 Received shutdown signal...');
    await scanner.stop();
    console.log('👋 Process exiting gracefully');
    process.exit(0);
});

// Start the scanner
scanner.start();

// Helper function to fetch transaction data
async function fetchTransaction(txid: string): Promise<any> {
    try {
        const startTime = Date.now();
        const response = await axios.get(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
        console.log(`⚡ Transaction fetch completed in ${Date.now() - startTime}ms`);
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching transaction:', {
            txid,
            error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                code: (error as any).code
            } : 'Unknown error'
        });
        throw error;
    }
} 