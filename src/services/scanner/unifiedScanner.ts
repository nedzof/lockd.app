import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { JungleBusTransaction } from './types';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMapData } from '../../shared/utils/mapProtocol.js';
import { fetchTransactionData } from '../shared/utils/whatsOnChain';
import { Transaction, ControlMessage, StructuredTransaction, VoteOption } from './types';
import { parseMapTransaction, ParsedTransaction } from './mapTransactionParser';
import { prisma } from '../prisma';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Test database connection on startup
async function testDatabaseConnection() {
    try {
        await prisma.$connect();
        console.log('Successfully connected to database');
        
        // Test query
        const count = await prisma.post.count();
        console.log(`Current post count in database: ${count}`);
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
}

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
const dbWorker = new Worker(join(__dirname, 'unifiedDbWorker.js'));

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

// Parse content from transaction
function parseContent(tx: any): string {
    console.log('\n=== Parsing Content ===');
    try {
        // Check MAP data first
        const mapDataArray = parseMapData(tx.data || []);
        const mapContent = mapDataArray[0]?.content;
        if (mapContent) {
            console.log('Found content in MAP data:', mapContent);
            return mapContent;
        }
        console.log('No content found in MAP data, checking script outputs...');

        // Check script outputs for content
        for (const output of tx.vout) {
            if (output.scriptPubKey?.hex) {
                const bytes = Buffer.from(output.scriptPubKey.hex, 'hex');
                const content = bytes.toString('utf8');
                const contentMatch = content.match(/content\s*([^\\x00]+)/);
                if (contentMatch?.[1]) {
                    console.log('Found content in script output:', contentMatch[1].trim());
                    return contentMatch[1].trim();
                }
            }
        }
        console.log('No content found in any outputs');
        return '';
    } catch (error) {
        console.error('Error parsing content:', error);
        return '';
    }
}

// Parse tags from transaction
function parseTags(tx: any): string[] {
    console.log('\n=== Parsing Tags ===');
    try {
        // Check MAP data first
        const mapDataArray = parseMapData(tx.data || []);
        if (mapDataArray[0]?.tags) {
            try {
                const tags = JSON.parse(mapDataArray[0].tags);
                console.log('Found tags in MAP data:', tags);
                return tags;
            } catch (e) {
                console.error('Error parsing MAP tags:', e);
            }
        }
        console.log('No tags found in MAP data, checking script outputs...');

        // Check script outputs for tags
        for (const output of tx.vout) {
            if (output.scriptPubKey?.hex) {
                const bytes = Buffer.from(output.scriptPubKey.hex, 'hex');
                const content = bytes.toString('utf8');
                const tagsMatch = content.match(/tags\s*([^\\x00]+)/);
                if (tagsMatch?.[1]) {
                    try {
                        // First try parsing as JSON
                        const tagsStr = tagsMatch[1].trim();
                        if (tagsStr.startsWith('[') && tagsStr.endsWith(']')) {
                            const tags = JSON.parse(tagsStr);
                            console.log('Found tags in script output:', tags);
                            return tags;
                        }
                        // If not JSON, try parsing as comma-separated string
                        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
                        if (tags.length > 0) {
                            console.log('Found comma-separated tags in script output:', tags);
                            return tags;
                        }
                    } catch (e) {
                        console.error('Error parsing script tags:', e);
                    }
                }
            }
        }
 
        console.log('No tags found, using default tag: ["lockdapp"]');
        return ['lockdapp'];
    } catch (error) {
        console.error('Error parsing tags:', error);
        return ['lockdapp'];
    }
}

// Parse locking amount from transaction
function parseLockingAmount(tx: any): { isLocked: boolean; amount?: number; duration?: number } {
    console.log('\n=== Parsing Lock Information ===');
    try {
        for (const output of tx.vout) {
            if (output.scriptPubKey?.hex) {
                const bytes = Buffer.from(output.scriptPubKey.hex, 'hex');
                const content = bytes.toString('utf8');
                
                const amountMatch = content.match(/lockAmount\s*(\d+)/);
                const durationMatch = content.match(/lockDuration\s*(\d+)/);
                
                if (amountMatch || durationMatch) {
                    const result = {
                        isLocked: true,
                        amount: amountMatch ? parseInt(amountMatch[1], 10) : undefined,
                        duration: durationMatch ? parseInt(durationMatch[1], 10) : undefined
                    };
                    console.log('Found lock information:', result);
                    return result;
                }
            }
        }
        console.log('No lock information found');
        return { isLocked: false };
    } catch (error) {
        console.error('Error parsing locking amount:', error);
        return { isLocked: false };
    }
}

// Parse vote options from transaction
function parseVoteOptions(tx: any): { isVote: boolean; options: any[] } {
    console.log('\n=== Parsing Vote Options ===');
    try {
        const optionsMap = new Map(); // Use a map to prevent duplicates
        let isVote = false;

        for (const output of tx.vout) {
            if (output.scriptPubKey?.hex) {
                const bytes = Buffer.from(output.scriptPubKey.hex, 'hex');
                const content = bytes.toString('utf8');
                
                if (content.includes('isVoteQuestion') || content.includes('vote_option')) {
                    isVote = true;
                    console.log('Found vote indicators in output');
                    
                    const optionMatch = content.match(/vote_option\s*([^\\x00]+)/);
                    const lockAmountMatch = content.match(/lockAmount\s*(\d+)/);
                    const lockDurationMatch = content.match(/lockDuration\s*(\d+)/);
                    
                    if (optionMatch) {
                        const optionContent = optionMatch[1].trim();
                        const option = {
                            content: optionContent,
                            lock_amount: lockAmountMatch ? parseInt(lockAmountMatch[1], 10) : 1000,
                            lock_duration: lockDurationMatch ? parseInt(lockDurationMatch[1], 10) : 1
                        };
                        console.log('Found vote option:', option);
                        // Use content as key to prevent duplicates
                        optionsMap.set(optionContent, option);
                    }
                }
            }
        }

        const result = { isVote, options: Array.from(optionsMap.values()) };
        if (isVote) {
            console.log('Vote parsing result:', result);
        }
 
        return result;
    } catch (error) {
        console.error('Error parsing vote options:', error);
        return { isVote: false, options: [] };
    }
}

// Helper function to extract image data from transaction
function extractImageFromTransaction(tx: string, source: string): { data: string; type: string; source: string } | null {
    console.log('\n=== Extracting Image Data ===');
    try {
        const buffer = Buffer.from(tx, 'hex');
        const rawContent = buffer.toString('utf8');
        
        // First try to find data URL pattern
        const dataUrlMatch = rawContent.match(/data:image\/(jpeg|png|gif);base64,([A-Za-z0-9+/=]+)/);
        if (dataUrlMatch) {
            console.log('Found image data URL pattern');
            const cleanedBase64 = cleanAndValidateBase64(dataUrlMatch[2]);
            if (cleanedBase64) {
                console.log('Successfully extracted and validated image from data URL');
                return {
                    type: `image/${dataUrlMatch[1]}`,
                    data: cleanedBase64,
                    source: `${source}_dataurl`
                };
            }
        }

        console.log('Checking for raw base64 data...');
        // Try to find raw base64 data
        const jpegBase64Match = rawContent.match(/\/9j\/([A-Za-z0-9+/=]+)/);
        if (jpegBase64Match) {
            console.log('Found JPEG pattern');
            const fullBase64 = '/9j/' + jpegBase64Match[1];
            const cleanedBase64 = cleanAndValidateBase64(fullBase64);
            if (cleanedBase64) {
                console.log('Successfully extracted and validated JPEG image');
                return {
                    type: 'image/jpeg',
                    data: cleanedBase64,
                    source: `${source}_raw_jpeg`
                };
            }
        }

        const pngBase64Match = rawContent.match(/iVBORw0KGg([A-Za-z0-9+/=]+)/);
        if (pngBase64Match) {
            console.log('Found PNG pattern');
            const fullBase64 = 'iVBORw0KGg' + pngBase64Match[1];
            const cleanedBase64 = cleanAndValidateBase64(fullBase64);
            if (cleanedBase64) {
                console.log('Successfully extracted and validated PNG image');
                return {
                    type: 'image/png',
                    data: cleanedBase64,
                    source: `${source}_raw_png`
                };
            }
        }

        console.log('No valid image data found');
        return null;
    } catch (error) {
        console.error('Error extracting image:', error);
        return null;
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

        // Parse all components separately
        const content = parseContent(fullTx);
        const tags = parseTags(fullTx);
        const lockingInfo = parseLockingAmount(fullTx);
        const imageData = extractImageFromTransaction(fullTx.vout[0]?.scriptPubKey?.hex || '', 'scriptPubKey');
        const voteData = parseVoteOptions(fullTx);

        console.log('Parsed Components:', {
            content,
            tags,
            lockingInfo,
            hasImage: !!imageData,
            voteData
        });

        // Send to worker for database processing
        dbWorker.postMessage({
            type: 'process_transaction',
            transaction: {
                txid: tx.id,
                content,
                author_address,
                block_height: tx.block_height || 0,
                created_at: new Date(),
                tags,
                is_vote: voteData.isVote,
                vote_options: voteData.options,
                media_type: imageData?.type,
                raw_image_data: imageData?.data,
                image_format: imageData?.type ? imageData.type.split('/')[1] : null,
                image_source: imageData?.source,
                metadata: {}
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
        if (client) {
            try {
                await client.Disconnect();
                console.log('JungleBus client disconnected');
            } catch (error) {
                console.error('Error disconnecting JungleBus client:', error);
            }
        }
        
        if (dbWorker) {
            try {
                await dbWorker.terminate();
                console.log('Database worker terminated');
            } catch (error) {
                console.error('Error terminating database worker:', error);
            }
        }
        
        if (prisma) {
            try {
                await prisma.$disconnect();
                console.log('Prisma client disconnected');
            } catch (error) {
                console.error('Error disconnecting Prisma client:', error);
            }
        }
        
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
        await testDatabaseConnection();
        
        console.log('Starting unified scanner from block 883819...');
        console.log('Using database URL:', process.env.DATABASE_URL?.split('?')[0]); // Log DB URL without credentials
        
        console.log('Starting regular subscription...');
        // Start regular subscription
        await client.Subscribe(
            "436d4681e23186b369291cf3e494285724964e92f319de5f56b6509d32627693",
            883819,
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

// Immediately start the scanner
(async () => {
    try {
        await startUnifiedScanner();
    } catch (error) {
        console.error('Failed to start scanner:', error);
        process.exit(1);
    }
})();

class UnifiedScanner {
    private static cleanString(s: string): string {
        return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/\s+/g, ' ').trim();
    }

    private static hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    private static bytesToString(bytes: Uint8Array): string {
        return new TextDecoder().decode(bytes);
    }

    private static extractImageFromTransaction(tx: string): { raw_image_data: string; image_format: string; image_source: string } | null {
        try {
            console.log('Starting image extraction from hex:', {
                hexLength: tx.length
            });
            
            const buffer = Buffer.from(tx, 'hex');
            const rawContent = buffer.toString('utf8');
            
            if (rawContent.includes('data:image')) {
                const match = rawContent.match(/data:image\/[^;]+;base64,[^"]+/);
                if (match) {
                    const [fullMatch] = match;
                    const [header, base64Data] = fullMatch.split(',');
                    const format = header.split('/')[1].split(';')[0];
                    
                    return {
                        raw_image_data: base64Data,
                        image_format: format,
                        image_source: 'transaction'
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('Error extracting image:', error);
            return null;
        }
    }

    private static parseScriptData(hex: string): Record<string, any> {
        try {
            const bytes = this.hexToBytes(hex);
            const data: Record<string, any> = {};
            const fullString = this.bytesToString(bytes);
            
            const extractContent = (start: string, end: string = '\x00'): string | null => {
                const startIdx = fullString.indexOf(start);
                if (startIdx === -1) return null;
                
                const contentStart = startIdx + start.length;
                const endIdx = fullString.indexOf(end, contentStart);
                if (endIdx === -1) return null;
                
                return this.cleanString(fullString.slice(contentStart, endIdx));
            };

            data.content = extractContent('content');
            data.version = extractContent('version') || '1.0.0';
            data.author_address = extractContent('author') || '';
            data.tags = [];
            
            // Extract tags
            let tagIndex = 1;
            while (true) {
                const tag = extractContent(`tag${tagIndex}`);
                if (!tag) break;
                data.tags.push(tag);
                tagIndex++;
            }
            
            // Handle vote-specific data
            if (fullString.includes('isVoteQuestion') || fullString.includes('what will flip btc')) {
                data.is_vote = true;
                data.vote_options = [];
                
                // Extract vote options
                let optionIndex = 1;
                while (true) {
                    const option = extractContent(`option${optionIndex}`);
                    if (!option) break;
                    data.vote_options.push(option);
                    optionIndex++;
                }
            }

            return data;
        } catch (error) {
            console.error('Error parsing script data:', error);
            return {};
        }
    }

    private static async processTransaction(tx: Transaction): Promise<void> {
        try {
            const scriptData = this.parseScriptData(tx.transaction);
            const imageData = this.extractImageFromTransaction(tx.transaction);
            
            const baseData = {
                txid: tx.tx.h,
                content: scriptData.content || '',
                author_address: scriptData.author_address || '',
                block_height: tx.blk?.h || 0,
                created_at: new Date(tx.blk?.t ? tx.blk.t * 1000 : Date.now()),
                tags: scriptData.tags || [],
                metadata: { version: scriptData.version }
            };
            
            if (scriptData.is_vote) {
                await this.processVoteTransaction(tx, { ...baseData, vote_options: scriptData.vote_options || [] });
            } else {
                await this.processPostTransaction(tx, { ...baseData, ...imageData });
            }
        } catch (error) {
            console.error('Error processing transaction:', error);
        }
    }

    private static async processPostTransaction(tx: Transaction, data: any): Promise<void> {
        await prisma.post.create({
            data: {
                ...data,
                is_vote: false
            }
        });
    }

    private static async processVoteTransaction(tx: Transaction, data: any): Promise<void> {
        await prisma.post.create({
            data: {
                ...data,
                is_vote: true
            }
        });
    }

    public static async start(): Promise<void> {
        const client = new JungleBusClient(process.env.JUNGLEBUS_URL || "");
        
        const subscription = await client.Subscribe(
            "lockd.app",  // subscription name
            Number(process.env.START_BLOCK) || 0,  // from block
            {
                onTransaction: this.processTransaction.bind(this),
                onError: (error: any) => console.error('Subscription error:', error),
                onStatus: (message: ControlMessage) => {
                    if (message.statusCode === ControlMessageStatusCode.WAITING) {
                        console.log('Caught up with the chain');
                    }
                },
                onMempool: this.processTransaction.bind(this)
            }
        );

        console.log('UnifiedScanner started successfully');
    }
}

export default UnifiedScanner;

async function processMapTransaction(tx: JungleBusTransaction) {
    try {
        if (!tx.data) return;
        const parsedTx = parseMapTransaction(tx.data);
        
        console.log('Processing transaction:', {
            txid: tx.id,
            type: parsedTx.type,
            hasImage: !!parsedTx.image,
            hasVote: !!parsedTx.vote,
            hasLock: !!parsedTx.lock
        });

        // Process based on transaction type
        switch (parsedTx.type) {
            case 'content':
                await processContentTransaction(parsedTx, tx.id);
                break;
            case 'vote':
                await processVoteTransaction(parsedTx, tx.id);
                break;
            case 'image':
                await processImageTransaction(parsedTx, tx.id);
                break;
            case 'mixed':
                await processMixedTransaction(parsedTx, tx.id);
                break;
        }

        console.log('Successfully processed and saved transaction:', tx.id);
    } catch (error) {
        console.error('Error processing MAP transaction:', error);
    }
}

async function processContentTransaction(tx: ParsedTransaction, txid: string) {
    console.log('Creating content post:', { txid, content: tx.content });
    const post = await prisma.post.create({
        data: {
            txid,
            content: tx.content,
            author_address: tx.author,
            created_at: new Date(tx.timestamp),
            is_locked: tx.lock?.isLocked || false,
            lock_duration: tx.lock?.duration,
            amount: tx.lock?.amount,
            unlock_height: tx.lock?.unlockHeight,
            block_height: tx.lock?.currentHeight || 0,
            tags: []
        }
    });
    console.log('Created content post:', post);
}

async function processVoteTransaction(tx: ParsedTransaction, txid: string) {
    // Create the main post first
    const post = await prisma.post.create({
        data: {
            txid,
            content: tx.content,
            author_address: tx.author,
            created_at: new Date(tx.timestamp),
            is_vote: true,
            block_height: tx.lock?.currentHeight || 0
        }
    });

    // Create vote options
    if (tx.vote?.options) {
        await Promise.all(tx.vote.options.map(option =>
            prisma.voteOption.create({
                data: {
                    txid: `${txid}-${option.index}`, // Create unique txid for each option
                    post_txid: txid,
                    content: option.text,
                    author_address: tx.author,
                    created_at: new Date(tx.timestamp),
                    lock_amount: option.lockAmount,
                    lock_duration: option.lockDuration,
                    tags: []
                }
            })
        ));
    }
}

async function processImageTransaction(tx: ParsedTransaction, txid: string) {
    await prisma.post.create({
        data: {
            txid,
            content: tx.content,
            author_address: tx.author,
            created_at: new Date(tx.timestamp),
            media_type: tx.image?.mimeType,
            raw_image_data: tx.image?.base64Data,
            image_format: tx.image?.mimeType?.split('/')[1],
            is_locked: tx.lock?.isLocked || false,
            lock_duration: tx.lock?.duration,
            amount: tx.lock?.amount,
            unlock_height: tx.lock?.unlockHeight,
            block_height: tx.lock?.currentHeight || 0
        }
    });
}

async function processMixedTransaction(tx: ParsedTransaction, txid: string) {
    if (tx.vote) {
        await processVoteTransaction(tx, txid);
    } else {
        await processImageTransaction(tx, txid);
    }
} 