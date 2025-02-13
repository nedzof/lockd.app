import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { parseMapTransaction, ParsedTransaction } from './mapTransactionParser.js';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Test database connection
async function testConnection() {
    try {
        await prisma.$connect();
        console.log('Database worker connected to database');
    } catch (error) {
        console.error('Database worker failed to connect:', error);
        process.exit(1);
    }
}

// Helper function to clean content
function cleanContent(content: string): string {
    if (!content) return '';
    
    // If content is base64 image data, return empty string and let metadata handle it
    if (content.startsWith('data:image/')) {
        return '';
    }
    
    // Remove MAP protocol prefix if present
    if (content.startsWith('MAP_VERSION')) {
        const parts = content.split('.');
        if (parts.length > 1) {
            return parts.slice(1).join('.').trim();
        }
    }

    // Handle content= prefix
    if (content.startsWith('content=')) {
        content = content.substring('content='.length);
    }
    
    // Try to parse JSON if it looks like JSON
    try {
        if (content.startsWith('{') || content.startsWith('[')) {
            const parsed = JSON.parse(content);
            if (typeof parsed === 'string') {
                return parsed.replace(/\u0000/g, '').trim();
            }
            return JSON.stringify(parsed);
        }
    } catch (e) {
        // Not JSON, continue with string handling
    }
    
    // Remove any null bytes and extra whitespace
    return content.replace(/\u0000/g, '').trim();
}

// Helper function to clean metadata
function cleanMetadata(metadata: any): Record<string, any> {
    if (!metadata) return {};
    
    try {
        // If metadata is a string, try to parse it
        const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        
        // Clean each value in the metadata object
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(metadataObj)) {
            if (typeof value === 'string') {
                // Remove null bytes from string values
                cleaned[key] = value.replace(/\u0000/g, '').trim();
            } else if (value === null || value === undefined) {
                // Skip null/undefined values
                continue;
            } else if (typeof value === 'object') {
                // Recursively clean nested objects
                cleaned[key] = cleanMetadata(value);
            } else {
                // Keep other types as is
                cleaned[key] = value;
            }
        }
        return cleaned;
    } catch (error) {
        console.error('Error cleaning metadata:', error);
        return { error: 'Failed to clean metadata' };
    }
}

// Helper function to clean tags
function cleanTags(tags: string | string[]): string[] {
    if (!Array.isArray(tags)) {
        // Try to parse if it's a string
        if (typeof tags === 'string') {
            try {
                if (tags.startsWith('[') && tags.endsWith(']')) {
                    const parsed = JSON.parse(tags);
                    if (Array.isArray(parsed)) {
                        tags = parsed;
                    } else {
                        return ['lockdapp'];
                    }
                } else {
                    tags = tags.split(',');
                }
            } catch (e) {
                console.error('Error parsing tags string:', e);
                return ['lockdapp'];
            }
        } else {
            return ['lockdapp'];
        }
    }
    
    return tags
        .map(tag => {
            if (typeof tag !== 'string') return null;
            // Remove any special characters, brackets, and trim
            return tag.replace(/[\u0000-\u001F\u007F-\u009F\[\]"']/g, '').trim();
        })
        .filter((tag): tag is string => tag !== null && tag.length > 0);
}

// Handle messages from main thread
parentPort?.on('message', async (message: any) => {
    try {
        console.log('Database worker received message:', message);

        if (message.type === 'process_transaction') {
            const tx = message.transaction;
            await processTransaction(tx);
        }
    } catch (error) {
        console.error('Database worker error:', error);
        parentPort?.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            txid: message.transaction?.txid
        });
    }
});

interface TransactionData {
    txid: string;
    data: string[];
    block_height: number;
    author_address: string;
}

async function processTransaction(transaction: TransactionData) {
    try {
        console.log('Processing transaction:', {
            txid: transaction.txid,
            type: 'content',
            hasContent: true,
            hasMetadata: true,
            isVote: false,
            isVoteQuestion: false,
            voteOptionsCount: 0
        });

        // Parse MAP metadata using unified parser
        const parsedTx = parseMapTransaction(transaction.data || []);
        
        // Prepare final data for database
        const finalData = {
            id: transaction.txid,
            txid: transaction.txid,
            content: parsedTx.content,
            author_address: parsedTx.author,
            block_height: transaction.block_height || 0,
            unlock_height: parsedTx.lock?.unlockHeight || 0,
            created_at: new Date(parsedTx.timestamp),
            tags: parsedTx.tags,
            metadata: {
                type: parsedTx.type,
                contentType: parsedTx.image?.mimeType || 'text/plain',
                fileName: parsedTx.image?.fileName || '',
                fileSize: parsedTx.image?.fileSize || 0,
                timestamp: parsedTx.timestamp,
                version: parsedTx.metadata.version,
                description: parsedTx.description,
                postId: parsedTx.postId,
                sequence: parsedTx.metadata.sequence,
                parentSequence: parsedTx.metadata.parentSequence,
                app: parsedTx.metadata.app
            },
            is_locked: !!parsedTx.lock,
            media_type: parsedTx.image?.mimeType || null,
            raw_image_data: parsedTx.image?.base64Data || null,
            image_format: parsedTx.image?.mimeType?.split('/')[1] || null,
            image_source: parsedTx.image?.source || null,
            is_vote: !!parsedTx.vote,
            is_vote_question: parsedTx.type === 'vote' || parsedTx.type === 'mixed',
            question_content: parsedTx.vote?.questionContent || null,
            amount: parsedTx.lock?.amount || null,
            lock_duration: parsedTx.lock?.duration || null,
            description: parsedTx.description || parsedTx.content.substring(0, 255)
        };

        console.log('Prepared data:', {
            txid: finalData.txid,
            type: finalData.metadata.type,
            content: finalData.content.substring(0, 100) + '...',
            author: finalData.author_address,
            tags: finalData.tags,
            isVote: finalData.is_vote,
            isVoteQuestion: finalData.is_vote_question
        });

        // Save to database
        await prisma.transaction.upsert({
            where: { txid: finalData.txid },
            update: finalData,
            create: finalData
        });

        // Send success message back to main thread
        parentPort?.postMessage({
            type: 'transaction_processed',
            txid: transaction.txid,
            success: true
        });
    } catch (error) {
        console.error('Error processing transaction:', error);
        parentPort?.postMessage({
            type: 'transaction_processed',
            txid: transaction.txid,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

// Test database connection on startup
testConnection(); 