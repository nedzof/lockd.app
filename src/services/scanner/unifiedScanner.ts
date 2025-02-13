import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { JungleBusTransaction } from './types';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parseMapData } from '../../shared/utils/mapProtocol.js';

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
const dbWorker = new Worker(path.join(__dirname, 'unifiedDbWorker.js'));

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

// Helper function to extract image data from transaction
function extractImageFromTransaction(tx: string, source: string): { data: string; type: string; source: string } | null {
    try {
        const buffer = Buffer.from(tx, 'hex');
        const rawContent = buffer.toString('utf8');
        
        // Helper function to clean and validate base64 data
        const cleanAndValidateBase64 = (base64Data: string): string | null => {
            try {
                const cleaned = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
                const decoded = Buffer.from(cleaned, 'base64');
                
                if (decoded[0] === 0xFF && decoded[1] === 0xD8 && decoded[2] === 0xFF) {
                    return cleaned;
                } else if (decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47) {
                    return cleaned;
                }
                
                return null;
            } catch (error) {
                console.error('Error cleaning/validating base64 data:', error);
                return null;
            }
        };

        // First try to find data URL pattern
        const dataUrlMatch = rawContent.match(/data:image\/(jpeg|png|gif);base64,([A-Za-z0-9+/=]+)/);
        if (dataUrlMatch) {
            const cleanedBase64 = cleanAndValidateBase64(dataUrlMatch[2]);
            if (cleanedBase64) {
                return {
                    type: `image/${dataUrlMatch[1]}`,
                    data: cleanedBase64,
                    source: `${source}_dataurl`
                };
            }
        }

        // Try to find raw base64 data
        const jpegBase64Match = rawContent.match(/\/9j\/([A-Za-z0-9+/=]+)/);
        if (jpegBase64Match) {
            const fullBase64 = '/9j/' + jpegBase64Match[1];
            const cleanedBase64 = cleanAndValidateBase64(fullBase64);
            if (cleanedBase64) {
                return {
                    type: 'image/jpeg',
                    data: cleanedBase64,
                    source: `${source}_raw_jpeg`
                };
            }
        }

        const pngBase64Match = rawContent.match(/iVBORw0KGg([A-Za-z0-9+/=]+)/);
        if (pngBase64Match) {
            const fullBase64 = 'iVBORw0KGg' + pngBase64Match[1];
            const cleanedBase64 = cleanAndValidateBase64(fullBase64);
            if (cleanedBase64) {
                return {
                    type: 'image/png',
                    data: cleanedBase64,
                    source: `${source}_raw_png`
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting image:', error);
        return null;
    }
}

// Helper function to parse vote-related data
function parseVoteData(scriptPubKeyHex: string): { isVote: boolean; content: string; lockAmount?: number; lockDuration?: number } {
    try {
        const bytes = Buffer.from(scriptPubKeyHex, 'hex');
        const fullString = bytes.toString('utf8');
        
        // Helper function to extract content between markers
        const extractContent = (start: string, end: string = '\x00'): string | null => {
            const startIdx = fullString.indexOf(start);
            if (startIdx === -1) return null;
            
            const contentStart = startIdx + start.length;
            const endIdx = fullString.indexOf(end, contentStart);
            if (endIdx === -1) return null;
            
            return fullString.slice(contentStart, endIdx).trim();
        };

        const data = {
            isVote: false,
            content: '',
            lockAmount: undefined as number | undefined,
            lockDuration: undefined as number | undefined
        };

        // Check for vote indicators
        if (fullString.includes('isVoteQuestion') || fullString.includes('vote_option')) {
            data.isVote = true;
            
            // Extract content
            data.content = extractContent('content') || 
                         extractContent('what will flip btc') || 
                         extractContent('vote_option') || '';

            // Extract lock details
            const lockAmount = extractContent('lockAmount');
            if (lockAmount) {
                data.lockAmount = parseInt(lockAmount, 10);
            }

            const lockDuration = extractContent('lockDuration');
            if (lockDuration) {
                data.lockDuration = parseInt(lockDuration, 10);
            }
        }

        return data;
    } catch (error) {
        console.error('Error parsing vote data:', error);
        return { isVote: false, content: '' };
    }
}

const onPublish = async function(tx: JungleBusTransaction) {
    console.log("TRANSACTION", JSON.stringify(tx, null, 2));
    
    try {
        // Fetch full transaction data
        const fullTx = await fetchTransaction(tx.id);
        
        // Get author address from the last output
        const author_address = fullTx.vout[fullTx.vout.length - 1]?.scriptPubKey?.addresses?.[0];
        if (!author_address) {
            console.error('Could not extract author address from transaction:', tx.id);
            return;
        }

        // Parse MAP data
        const mapDataArray = parseMapData(fullTx.data || []);
        const parsedMapData = mapDataArray.length > 0 ? mapDataArray[0] : {};
        console.log('Parsed MAP data:', JSON.stringify(parsedMapData, null, 2));

        // Check for vote data in all outputs
        let voteData = { isVote: false, content: '', options: [] as any[] };
        for (const output of fullTx.vout) {
            if (output.scriptPubKey?.hex) {
                const parsedVote = parseVoteData(output.scriptPubKey.hex);
                if (parsedVote.isVote) {
                    voteData.isVote = true;
                    if (!voteData.content && parsedVote.content) {
                        voteData.content = parsedVote.content;
                    }
                    if (parsedVote.lockAmount) {
                        voteData.options.push({
                            content: parsedVote.content,
                            lock_amount: parsedVote.lockAmount,
                            lock_duration: parsedVote.lockDuration || 1
                        });
                    }
                }
            }
        }

        // Extract image data if present
        let imageData = null;
        if (parsedMapData.contentType?.startsWith('image/') || parsedMapData.type === 'image') {
            for (const output of fullTx.vout) {
                if (output.scriptPubKey?.hex) {
                    imageData = extractImageFromTransaction(output.scriptPubKey.hex, 'scriptPubKey');
                    if (imageData) break;
                }
            }
        }

        // Send to worker for database processing
        dbWorker.postMessage({
            type: 'process_transaction',
            transaction: {
                txid: tx.id,
                content: voteData.content || parsedMapData.content || '',
                author_address,
                block_height: tx.block_height || 0,
                created_at: new Date(parsedMapData.timestamp || Date.now()),
                tags: parsedMapData.tags ? JSON.parse(parsedMapData.tags) : ['lockdapp'],
                is_vote: voteData.isVote,
                vote_options: voteData.options,
                media_type: imageData?.type || parsedMapData.contentType,
                raw_image_data: imageData?.data,
                image_format: imageData?.type ? imageData.type.split('/')[1] : null,
                image_source: imageData?.source,
                metadata: parsedMapData
            }
        });
    } catch (error) {
        console.error("Error processing transaction:", error);
    }
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

const onMempool = async function(tx: JungleBusTransaction) {
    await onPublish(tx);
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
export async function startUnifiedScanner() {
    try {
        console.log('Starting unified scanner from block 883520...');
        await client.Subscribe(
            "436d4681e23186b369291cf3e494285724964e92f319de5f56b6509d32627693",
            883804,
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