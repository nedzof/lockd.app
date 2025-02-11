import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { Transaction, ControlMessage } from './junglebus.types.js';
import { TRANSACTION_TYPES } from './junglebus.types.js';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

// Helper function to parse MAP data while preserving all fields
function parseMapData(data: string[]): Record<string, any> {
    const mapData: Record<string, any> = {};
    for (const item of data) {
        const [key, value] = item.split('=');
        if (key && value) {
            mapData[key] = value;
        }
    }
    return mapData;
}

async function fetchTransactionData(txid: string): Promise<any> {
    try {
        const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching transaction data:', error);
        return null;
    }
}

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
    }
});

const onPublish = async function(tx: Transaction) {
    try {
        // Get full transaction data from JungleBus
        const fullTx = await client.GetTransaction(tx.id);
        
        console.log("TRANSACTION DETECTED:", JSON.stringify({
            id: fullTx.id,
            output_types: fullTx.output_types,
            contexts: fullTx.contexts,
            sub_contexts: fullTx.sub_contexts,
            data: fullTx.data
        }, null, 2));

        // Skip if not a MAP protocol transaction or not our app
        if (!fullTx.data?.some(d => d.startsWith('app=lockd.app'))) {
            console.log('Skipping non-lockd.app transaction:', fullTx.id);
            return;
        }

        // Get full transaction data from WhatsOnChain
        const txData = await fetchTransactionData(fullTx.id);
        if (!txData) {
            console.error('Could not fetch transaction data for:', fullTx.id);
            return;
        }

        // Extract author address from transaction outputs
        const author_address = txData.vout.find((out: any) => 
            out.scriptPubKey.type === 'pubkeyhash'
        )?.scriptPubKey.addresses?.[0];

        if (!author_address) {
            console.error('Could not extract author address from transaction:', fullTx.id);
            return;
        }

        // Parse the MAP data - preserve all fields
        const mapData = parseMapData(fullTx.data || []);
        
        console.log('Parsed MAP data:', JSON.stringify(mapData, null, 2));
        
        // Extract required fields
        const content = mapData.content || '';
        const contentType = mapData.contentType || 'text/plain';
        const type = mapData.type || 'post';
        const timestamp = mapData.timestamp || new Date().toISOString();
        
        // Keep original tags format
        const tags = mapData.tags || '["lockdapp"]';

        // Create or update post in database
        try {
            const post = await prisma.post.upsert({
                where: { txid: fullTx.id },
                create: {
                    txid: fullTx.id,
                    content,
                    author_address,
                    media_type: contentType,
                    block_height: fullTx.block_height || 0,
                    amount: mapData.lockAmount ? parseInt(mapData.lockAmount) : undefined,
                    unlock_height: mapData.unlockHeight ? parseInt(mapData.unlockHeight) : undefined,
                    description: content,
                    created_at: new Date(timestamp),
                    tags: JSON.parse(typeof tags === 'string' ? tags : '["lockdapp"]'),
                    metadata: mapData,
                    is_locked: !!mapData.unlockHeight,
                    lock_duration: mapData.lockDuration ? parseInt(mapData.lockDuration) : undefined
                },
                update: {
                    block_height: fullTx.block_height || 0,
                    metadata: mapData
                }
            });
            console.log(`Successfully processed post in database:`, {
                txid: post.txid,
                block_height: post.block_height,
                is_locked: post.is_locked,
                metadata: mapData
            });
        } catch (dbError: any) {
            console.error('Database error:', {
                code: dbError.code,
                message: dbError.message,
                txid: fullTx.id
            });
            throw dbError;
        }
    } catch (error) {
        console.error('Error processing transaction:', error);
    }
};

const onStatus = function(message: ControlMessage) {
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

const onError = function(error: any) {
    console.error('JungleBus error:', error);
};

const onMempool = async function(tx: Transaction) {
    // Process mempool transactions the same way as confirmed ones
    await onPublish(tx);
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    try {
        await prisma.$disconnect();
        console.log('Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start the service with specific block range
(async () => {
    try {
        console.log('Starting JungleBus service for blocks 883520-883530...');
        const subscription = await client.Subscribe(
            "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
            883520, // Start from block 883520
            onPublish,
            onStatus,
            onError,
            onMempool
        );

        // Monitor block height and disconnect after reaching target
        const intervalId = setInterval(async () => {
            if (subscription.GetCurrentBlock() >= 883530) {
                clearInterval(intervalId);
                console.log('Reached target block height. Shutting down...');
                await prisma.$disconnect();
                process.exit(0);
            }
        }, 1000);

    } catch (error) {
        console.error("Error starting JungleBus service:", error);
        await prisma.$disconnect();
        process.exit(1);
    }
})(); 