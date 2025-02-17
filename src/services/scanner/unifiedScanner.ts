import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { JungleBusClient as JungleBus, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import dotenv from 'dotenv';
import { parseMapTransaction } from './mapTransactionParser.js';
import type { JungleBusTransaction } from './types';
import fs from 'fs';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { UnifiedScanner } from './unifiedScanner';

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

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a worker for database operations
let dbWorker = fork(path.join(__dirname, 'unifiedDbWorker.ts'), [], {
    execArgv: ['--loader', 'tsx']
});

// Initialize database worker
function initializeDbWorker(): void {
    console.log('🌟 Initializing database worker...');
    
    // Create worker
    dbWorker = fork(path.join(__dirname, 'unifiedDbWorker.ts'), [], {
        execArgv: ['--loader', 'tsx']
    });

    // Handle worker messages
    dbWorker.on('message', (message: any) => {
        console.log('📬 Worker message:', message);
    });

    // Handle worker errors
    dbWorker.on('error', (error: Error) => {
        console.error('❌ Worker error:', error);
        // Restart worker
        setTimeout(() => {
            console.log('🔄 Restarting worker after error...');
            initializeDbWorker();
        }, 1000);
    });

    // Handle worker exit
    dbWorker.on('exit', (code: number) => {
        console.log('👋 Worker exited with code:', code);
        // Restart worker if it exits
        if (code !== 0) {
            setTimeout(() => {
                console.log('🔄 Restarting worker after exit...');
                initializeDbWorker();
            }, 1000);
        }
    });

    // Send initialization message
    dbWorker.send({ type: 'init' });
    console.log('✅ Database worker initialized');
}

// Cleanup function
function cleanup(): void {
    console.log('🧹 Cleaning up...');
    
    if (dbWorker) {
        console.log('👋 Terminating database worker...');
        dbWorker.kill();
    }
    
    process.exit(0);
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function fetchFullTransaction(txid: string): Promise<any> {
    try {
        const response = await axios.get(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
        console.log('📦 Full transaction details:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching transaction:', error);
        return null;
    }
}

async function processTransaction(tx: JungleBusTransaction): Promise<void> {
    try {
        // Fetch full transaction details
        const fullTx = await fetchFullTransaction(tx.id);
        
        console.log('\n🔍 Processing transaction:', {
            txid: tx.id,
            blockHeight: tx.block_height,
            outputs: fullTx?.outputs,
            inputs: fullTx?.inputs,
            data: fullTx?.data,
            contexts: fullTx?.contexts,
            addresses: fullTx?.addresses // Added logging for addresses
        });

        // Check if this is a MAP protocol transaction
        let isMapTransaction = false;
        
        // Check contexts for MAP protocol markers
        if (fullTx?.contexts?.length) {
            isMapTransaction = fullTx.contexts.some(ctx => 
                ctx === '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5' || // MAP protocol address
                ctx === 'map' || // MAP context
                ctx.startsWith('text/') || // Content type
                ctx.startsWith('image/') // Image type
            );
        }

        // Check data array for MAP protocol markers
        if (!isMapTransaction && fullTx?.data?.length) {
            isMapTransaction = fullTx.data.some(item => {
                const [key, value] = item.split('=');
                const keyLower = key?.toLowerCase();
                return keyLower === 'app' || 
                       keyLower === 'type' || 
                       keyLower === 'content' ||
                       keyLower === 'map' ||
                       keyLower === 'postid' ||
                       keyLower === 'timestamp' ||
                       keyLower === 'sequence' ||
                       keyLower.startsWith('map_');
            });
        }

        if (!isMapTransaction) {
            console.log('⏭️ Not a MAP protocol transaction:', tx.id);
            return;
        }

        // Parse MAP transaction
        console.log('✨ Found MAP protocol transaction:', tx.id);
        
        // Convert JungleBus transaction to our format
        const mappedTx = {
            txid: tx.id,
            blockHeight: tx.block_height || 0,
            timestamp: tx.block_time ? tx.block_time * 1000 : Date.now(),
            inputs: fullTx?.inputs || [],
            outputs: fullTx?.outputs || [],
            data: fullTx?.data || [],
            contexts: fullTx?.contexts || [],
            addresses: fullTx?.addresses || []
        };

        console.log('📦 Mapped transaction:', {
            txid: mappedTx.txid,
            addresses: mappedTx.addresses
        });

        const post = await parseMapTransaction(mappedTx);
        
        if (post) {
            // Send to database worker
            dbWorker.send({
                type: 'transaction',
                data: post
            });
            
            console.log('✅ MAP transaction processed:', {
                txid: post.txid,
                content: post.content?.text,
                author: post.author,
                metadata: post.metadata,
                imageCount: post.images?.length
            });
        } else {
            console.log('❌ Failed to parse MAP transaction:', tx.id);
        }
    } catch (error) {
        console.error('❌ Error processing transaction:', error);
    }
}

// Process transactions in order
async function processTransactions(transactions: JungleBusTransaction[]): Promise<void> {
    try {
        console.log(`\n🔄 Processing ${transactions.length} transactions`);
        
        for (const tx of transactions) {
            const startTime = Date.now();
            
            try {
                // Basic transaction validation
                if (!tx || !tx.id) {
                    console.error('❌ Invalid transaction data:', tx);
                    continue;
                }

                console.log('\n✅ Transaction data retrieved:', {
                    txid: tx.id,
                    outputs: tx.outputs?.length || 0,
                    block_height: tx.block_height
                });

                await processTransaction(tx);
                
                const duration = Date.now() - startTime;
                console.log(`⚡ Transaction fetch completed in ${duration}ms`);
            } catch (error) {
                console.error('❌ Error processing transaction:', {
                    txid: tx.id,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    } catch (error) {
        console.error('❌ Error in transaction batch processing:', error);
    }
}

// Initialize scanner
async function initializeScanner(): Promise<void> {
    try {
        console.log('\n🚀 Starting transaction scanner...');
        
        // Initialize database worker
        initializeDbWorker();

        // Initialize JungleBus client
        console.log('🌟 Initializing JungleBus client...');
        
        const client = new JungleBus("wss://junglebus.gorillapool.io", {
            useSSL: true,
            onConnected(ctx) {
                console.log("🔌 Connected to JungleBus:", ctx);
            },
            onConnecting(ctx) {
                console.log("🔄 Connecting to JungleBus:", ctx);
            },
            onDisconnected(ctx) {
                console.log("❌ Disconnected from JungleBus:", ctx);
            },
            onError(ctx) {
                console.error("❌ JungleBus error:", ctx);
            }
        });

        // Subscribe to MAP protocol transactions
        await client.Subscribe(
            "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
            884200,
            async (tx: JungleBusTransaction) => {
                try {
                    console.log("\n📥 Received transaction:", tx.id);

                    await processTransaction(tx);
                } catch (error) {
                    console.error('❌ Error processing transaction:', error);
                }
            },
            (msg: any) => {
                if (msg.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
                    console.log("✅ Block processed:", msg.block);
                } else if (msg.statusCode === ControlMessageStatusCode.WAITING) {
                    console.log("⏳ Waiting for new block:", msg);
                } else if (msg.statusCode === ControlMessageStatusCode.REORG) {
                    console.log("⚠️ Reorg triggered:", msg);
                } else if (msg.statusCode === ControlMessageStatusCode.ERROR) {
                    console.error("❌ JungleBus error:", msg);
                }
            },
            (error: any) => {
                console.error("❌ Subscription error:", error);
            }
        );

        console.log('✅ Subscribed to MAP protocol transactions');
        console.log('✅ Scanner initialization complete');

    } catch (error) {
        console.error('❌ Failed to initialize scanner:', error);
        process.exit(1);
    }
}

// Start the scanner
const scanner = new UnifiedScanner();
scanner.on('transaction', async ({ post, prisma }) => {
    try {
        await prisma.post.create({
            data: post
        });
    } catch (error) {
        console.error('Error creating post:', error);
    }
});
scanner.start().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

// Helper function to fetch transaction data
async function fetchTransaction(txid: string): Promise<any> {
    try {
        const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/raw`);
        if (!response.data) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching transaction:', error);
        throw error;
    }
}