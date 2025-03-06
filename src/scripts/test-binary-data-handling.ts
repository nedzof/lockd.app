/**
 * Test script for diagnosing binary data handling issues in the transaction parser
 */
import { TransactionDataParser } from '../parser/transaction_data_parser.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { VoteTransactionService } from '../services/vote-transaction-service.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up the parser and services
const parser = new TransactionDataParser();
const prisma = new PrismaClient();
const voteService = new VoteTransactionService(prisma);

async function testBinaryDataHandling() {
    try {
        logger.info('🧪 Starting binary data handling test');

        // Test multiple transaction types, including one with a GIF image
        const txIds = [
            // Original problematic transaction
            '5c47ed893a92efe4ad55e849f905afbedc7eeb8764902e500e84a3df7390614d',
            // Known transaction with GIF image
            'e0104b41236702b526292684c9d51bcf165cac1a4c5534d5b77ebb70dd9d6ea4',
            // Another transaction to test binary detection
            '3f0bd7d2e71bc5dae5d5dd147ea1f7e6b7e4147e54345d5f755fc61c2986f938'
        ];
        
        for (const txId of txIds) {
            logger.info(`\n\n🔍 Testing transaction ${txId}`);
            
            // Try to load the transaction from a local JSON file if available
            let txData;
            const txFilePath = path.join(__dirname, '..', 'parser', `${txId}.json`);
            
            if (fs.existsSync(txFilePath)) {
                logger.info(`📋 Loading transaction from file: ${txFilePath}`);
                const fileContent = fs.readFileSync(txFilePath, 'utf8');
                txData = JSON.parse(fileContent);
            } else {
                logger.info(`🔍 Fetching transaction ${txId} from JungleBus`);
                txData = await parser.fetch_transaction(txId);
                
                if (txData) {
                    // Save the transaction data to a file for future reference
                    fs.writeFileSync(txFilePath, JSON.stringify(txData, null, 2));
                    logger.info(`💾 Saved transaction data to ${txFilePath}`);
                } else {
                    logger.error(`❌ Failed to load transaction ${txId}`);
                    continue; // Skip to next transaction
                }
            }
        
            // Test the data extraction
            logger.info('🔍 Testing data extraction from transaction');
            const extractedData = parser.extract_data_from_transaction(txData);
            
            logger.info('📊 Extracted data summary', {
                tx_id: txId,
                item_count: extractedData.length,
                first_few_items: extractedData.slice(0, 3).map(item => 
                    item.length > 50 ? item.substring(0, 50) + '...' : item
                )
            });
            
            // Test parsing the transaction
            logger.info('🔍 Testing transaction parsing');
            const parsedData = parser.process_transaction_data(extractedData, txId);
            
            // Check for binary content detection
            const hasBinaryContentType = (
                (parsedData.content_type && parsedData.content_type.startsWith('image/')) ||
                (parsedData.media_type && parsedData.media_type.startsWith('image/'))
            );
            
            const hasHexEncodedContent = (
                parsedData.content && 
                typeof parsedData.content === 'string' && 
                parsedData.content.startsWith('hex:')
            );
            
            const isGif = (
                (parsedData.content_type === 'image/gif') ||
                (parsedData.media_type === 'image/gif')
            );
            
            logger.info('📊 Parsed data', {
                tx_id: txId,
                content_preview: typeof parsedData.content === 'string' ? 
                    (parsedData.content.length > 50 ? 
                        parsedData.content.substring(0, 50) + '...' : 
                        parsedData.content) : 
                    'non-string content',
                is_vote: parsedData.is_vote,
                is_binary: hasBinaryContentType || hasHexEncodedContent,
                is_gif: isGif,
                content_type: parsedData.content_type,
                media_type: parsedData.media_type,
                has_raw_image_data: !!parsedData.raw_image_data,
                post_id: parsedData.post_id
            });
            
            // Test if it's a vote transaction
            const isVote = parser.is_vote_transaction(parsedData);
            logger.info(`🗳️ Is vote transaction: ${isVote}`);
            
            // Store the transaction in the database
            try {
                logger.info('💾 Testing database storage');
                
                // Create a parsed transaction object
                const txToStore = {
                    tx_id: txId,
                    block_height: 800000,
                    block_time: new Date().toISOString(),
                    author_address: '1TestAddress',
                    type: isVote ? 'vote' : 'post',
                    protocol: 'MAP',
                    content: parsedData.content,
                    content_type: parsedData.content_type,
                    media_type: parsedData.media_type,
                    raw_image_data: parsedData.raw_image_data,
                    image_metadata: parsedData.image_metadata,
                    metadata: {
                        post_txid: parsedData.post_id || txId,
                        content: parsedData.content,
                        content_type: parsedData.content_type,
                        media_type: parsedData.media_type,
                        raw_image_data: parsedData.raw_image_data,
                        image_metadata: parsedData.image_metadata
                    }
                };
                
                // Use the DbClient through Prisma for storage
                await prisma.processed_transaction.upsert({
                    where: { tx_id: txId },
                    update: {
                        block_height: 800000,
                        block_time: BigInt(new Date().getTime()),
                        type: isVote ? 'vote' : 'post',
                        protocol: 'MAP',
                        metadata: txToStore.metadata as any
                    },
                    create: {
                        tx_id: txId,
                        block_height: 800000,
                        block_time: BigInt(new Date().getTime()),
                        type: isVote ? 'vote' : 'post',
                        protocol: 'MAP',
                        metadata: txToStore.metadata as any
                    }
                });
                
                // Also create/update a post record
                if (!isVote) {
                    await prisma.post.upsert({
                        where: { tx_id: parsedData.post_id || txId },
                        update: {
                            content: parsedData.content || '',
                            author_address: '1TestAddress',
                            media_type: parsedData.media_type,
                            content_type: parsedData.content_type,
                            raw_image_data: parsedData.raw_image_data ? 
                                Buffer.from(parsedData.raw_image_data, 'base64') : 
                                null,
                            image_metadata: parsedData.image_metadata as any,
                            metadata: txToStore.metadata as any
                        },
                        create: {
                            tx_id: parsedData.post_id || txId,
                            content: parsedData.content || '',
                            author_address: '1TestAddress',
                            media_type: parsedData.media_type,
                            content_type: parsedData.content_type,
                            raw_image_data: parsedData.raw_image_data ? 
                                Buffer.from(parsedData.raw_image_data, 'base64') : 
                                null,
                            image_metadata: parsedData.image_metadata as any,
                            metadata: txToStore.metadata as any
                        }
                    });
                }
                
                logger.info('✅ Database storage successful for transaction', { tx_id: txId });
                
                // If binary content, verify it was stored correctly
                if (hasBinaryContentType || isGif) {
                    // Retrieve the post to verify binary data was stored correctly
                    const storedPost = await prisma.post.findUnique({
                        where: { tx_id: parsedData.post_id || txId }
                    });
                    
                    logger.info('🔍 Checking stored binary data', {
                        tx_id: txId,
                        has_stored_content_type: !!storedPost?.content_type,
                        stored_content_type: storedPost?.content_type,
                        has_stored_media_type: !!storedPost?.media_type,
                        stored_media_type: storedPost?.media_type,
                        has_raw_image_data: !!storedPost?.raw_image_data,
                        raw_image_data_length: storedPost?.raw_image_data?.length
                    });
                }
                
            } catch (dbError) {
                logger.error('❌ Error storing transaction in database', {
                    tx_id: txId,
                    error: dbError instanceof Error ? dbError.message : String(dbError),
                    stack: dbError instanceof Error ? dbError.stack : undefined
                });
            }
        }
        
        logger.info('✅ Binary data handling test completed for all transactions');
    } catch (error) {
        logger.error('❌ Error in binary data handling test', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    } finally {
        // Clean up
        await prisma.$disconnect();
    }
}

// Improved error handler
function safeStringify(obj: any): string {
    try {
        return JSON.stringify(obj, (key, value) => {
            // Handle Buffer objects specially
            if (value instanceof Buffer) {
                return `[Buffer of length ${value.length}]`;
            }
            // Handle BigInt values
            if (typeof value === 'bigint') {
                return value.toString();
            }
            // Avoid circular references
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular Reference]';
                }
                seen.add(value);
            }
            return value;
        }, 2);
    } catch (e) {
        return `[Error serializing object: ${e instanceof Error ? e.message : String(e)}]`;
    }
}

// Set for tracking circular references
const seen = new WeakSet();

// Run the test with enhanced error handling
testBinaryDataHandling().catch(error => {
    console.error('❌ Unhandled error in test script');
    
    if (error instanceof Error) {
        console.error(`Error message: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
    } else {
        console.error(`Non-Error object thrown:`, safeStringify(error));
    }
    
    process.exit(1);
});
