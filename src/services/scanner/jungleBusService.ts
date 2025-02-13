import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { 
  JungleBusTransaction,
  ControlMessage,
  TRANSACTION_TYPES,
  ParsedPost,
  MapMetadata,
  PostCreateInput
} from './types';
import { PrismaClient } from '@prisma/client';
import { parseMapTransaction, convertTransactionToOutputs } from './mapParser';

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
});

// Helper function to extract image data from transaction
function extractImageFromTransaction(tx: string, source: string): { data: string; type: string; source: string } | null {
    try {
        console.log('Starting image extraction from hex:', {
            source,
            hexLength: tx.length,
            hexStart: tx.substring(0, 50),
            hexEnd: tx.substring(tx.length - 50)
        });
        
        // Convert hex to buffer for binary operations
        const buffer = Buffer.from(tx, 'hex');
        const rawContent = buffer.toString('utf8');
        
        console.log('Raw content preview:', {
            source,
            length: rawContent.length,
            start: rawContent.substring(0, 100),
            containsDataUrl: rawContent.includes('data:image'),
            containsBase64: rawContent.includes(';base64,')
        });

        // Helper function to clean and validate base64 data
        const cleanAndValidateBase64 = (base64Data: string): string | null => {
            try {
                // Remove any invalid characters
                const cleaned = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
                
                // Verify the cleaned data is valid base64
                const decoded = Buffer.from(cleaned, 'base64');
                
                // Check for JPEG or PNG signatures
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
            console.log('Found data URL image:', {
                source,
                type: dataUrlMatch[1],
                dataLength: dataUrlMatch[2].length,
                preview: dataUrlMatch[2].substring(0, 50) + '...'
            });
            
            const cleanedBase64 = cleanAndValidateBase64(dataUrlMatch[2]);
            if (cleanedBase64) {
                return {
                    type: `image/${dataUrlMatch[1]}`,
                    data: cleanedBase64,
                    source: `${source}_dataurl`
                };
            }
        }

        // Try to find raw base64 JPEG data (starting with /9j/)
        const jpegBase64Match = rawContent.match(/\/9j\/([A-Za-z0-9+/=]+)/);
        if (jpegBase64Match) {
            console.log('Found raw base64 JPEG data:', {
                source,
                dataLength: jpegBase64Match[1].length,
                preview: jpegBase64Match[1].substring(0, 50) + '...'
            });
            
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

        // Try to find raw base64 PNG data (starting with iVBORw0KGg)
        const pngBase64Match = rawContent.match(/iVBORw0KGg([A-Za-z0-9+/=]+)/);
        if (pngBase64Match) {
            console.log('Found raw base64 PNG data:', {
                source,
                dataLength: pngBase64Match[1].length,
                preview: pngBase64Match[1].substring(0, 50) + '...'
            });
            
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

        // Try to find OP_FALSE OP_IF pattern
        const opFalseOpIf = '0063'; // OP_FALSE OP_IF in hex
        const contentStart = tx.indexOf(opFalseOpIf);
        
        if (contentStart !== -1) {
            console.log('Found OP_FALSE OP_IF at position:', contentStart);
            
            // Get content after OP_FALSE OP_IF
            const contentHex = tx.substring(contentStart + opFalseOpIf.length);
            const contentBuffer = Buffer.from(contentHex, 'hex');
            const content = contentBuffer.toString('utf8');
            
            console.log('Content after OP_FALSE OP_IF:', {
                source,
                length: content.length,
                preview: content.substring(0, 100)
            });
            
            // Look for base64 encoded image in OP_FALSE OP_IF content
            const base64Match = content.match(/data:image\/(jpeg|png|gif);base64,([A-Za-z0-9+/=]+)/);
            if (base64Match) {
                console.log('Found base64 encoded image in OP_FALSE OP_IF content:', {
                    source,
                    type: base64Match[1],
                    dataLength: base64Match[2].length,
                    preview: base64Match[2].substring(0, 50) + '...'
                });
                
                const cleanedBase64 = cleanAndValidateBase64(base64Match[2]);
                if (cleanedBase64) {
          return {
                        type: `image/${base64Match[1]}`,
                        data: cleanedBase64,
                        source: `${source}_opif_dataurl`
                    };
                }
            }
            
            // Look for raw image signatures
            const signatures = {
                jpeg: [0xFF, 0xD8, 0xFF],
                png: [0x89, 0x50, 0x4E, 0x47]
            };
            
            // Check for JPEG
            const jpegIndex = content.split('').findIndex((_, i) => 
                signatures.jpeg.every((byte, j) => content.charCodeAt(i + j) === byte)
            );
            
            if (jpegIndex >= 0) {
                const imageData = content.substring(jpegIndex);
                console.log('Found raw JPEG data:', {
                    source,
                    startIndex: jpegIndex,
                    dataLength: imageData.length,
                    firstBytes: Array.from(Buffer.from(imageData.substring(0, 10))).map(b => b.toString(16))
                });
                return {
                    type: 'image/jpeg',
                    data: Buffer.from(imageData).toString('base64'),
                    source: `${source}_opif_raw_jpeg`
                };
            }
            
            // Check for PNG
            const pngIndex = content.split('').findIndex((_, i) => 
                signatures.png.every((byte, j) => content.charCodeAt(i + j) === byte)
            );
            
            if (pngIndex >= 0) {
                const imageData = content.substring(pngIndex);
                console.log('Found raw PNG data:', {
                    source,
                    startIndex: pngIndex,
                    dataLength: imageData.length,
                    firstBytes: Array.from(Buffer.from(imageData.substring(0, 10))).map(b => b.toString(16))
                });
                return {
                    type: 'image/png',
                    data: Buffer.from(imageData).toString('base64'),
                    source: `${source}_opif_raw_png`
                };
            }
        }
        
        console.log('No image data found in content from source:', source);
      return null;
    } catch (error) {
        console.error('Error extracting image from transaction:', { error, source });
      return null;
    }
  }

// Helper function to find ordinal output
function findOrdinalOutput(tx: any): string | null {
    if (!tx?.vout) return null;
    
    // Find the largest nonstandard output
    let largestOutput = null;
    let largestSize = 0;
    
    for (const output of tx.vout) {
        if (output.scriptPubKey.type === 'nonstandard' && output.scriptPubKey.hex) {
            const size = output.scriptPubKey.hex.length;
            if (size > largestSize) {
                largestSize = size;
                largestOutput = output.scriptPubKey.hex;
            }
        }
    }
    
    return largestOutput;
}

// Helper function to process a MAP transaction
async function processMapTransaction(tx: JungleBusTransaction): Promise<void> {
    try {
        console.log('Processing transaction:', {
            txid: tx.id,
            dataCount: tx.data?.length,
            contexts: tx.contexts
        });

        // Skip if no data or contexts
        if (!tx.data || !tx.contexts || !tx.contexts.includes(TRANSACTION_TYPES.MAP.PREFIX)) {
            console.log('Skipping transaction - no MAP data');
            return;
        }

        // Convert JungleBus transaction to our format
        const rawTx = {
            id: tx.id,
            outputs: tx.data.map(data => ({ data: data.split(','), contexts: tx.contexts }))
        };

        // Parse the transaction
        const outputs = convertTransactionToOutputs(rawTx);
        console.log('Converted outputs:', {
            count: outputs.length,
            types: outputs.map(o => o.data.MAP_TYPE)
        });

        const parsedPost = parseMapTransaction(tx.id, outputs);
        console.log('Parsed post:', {
            txid: parsedPost.txid,
            content: {
                type: parsedPost.content.type,
                contentType: parsedPost.content.contentType,
                sequence: parsedPost.content.sequence
            },
            hasImage: !!parsedPost.image,
            hasVoteQuestion: !!parsedPost.voteQuestion,
            voteOptionsCount: parsedPost.voteOptions?.length,
            hasTags: !!parsedPost.tags,
            createdAt: parsedPost.createdAt
        });

        // Skip if invalid post
        if (!parsedPost.content) {
            console.log('Invalid post structure:', tx.id);
            return;
        }

        // Extract image if present
        let imageData = null;
        if (parsedPost.image) {
            console.log('Extracting image data from transaction');
            imageData = extractImageFromTransaction(tx.transaction, 'map_output');
            console.log('Image data extracted:', {
                type: imageData?.type,
                source: imageData?.source,
                dataLength: imageData?.data?.length
            });
        }

        // Create base post data
        const postData: PostCreateInput = {
            txid: parsedPost.txid,
            content: parsedPost.content.content,
            author_address: parsedPost.content.author,
            created_at: new Date(parsedPost.createdAt),
            block_height: tx.block_height || 0,
            tags: parsedPost.tags?.tags || [],
            metadata: {
                type: parsedPost.content.type,
                contentType: parsedPost.content.contentType,
                version: parsedPost.content.version,
                description: parsedPost.content.description,
                lockDuration: parsedPost.content.lockDuration,
                lockAmount: parsedPost.content.lockAmount,
                unlockHeight: parsedPost.content.unlockHeight,
                predictionData: parsedPost.content.predictionData
            },
            description: parsedPost.content.description,
            lock_duration: parsedPost.content.lockDuration,
            amount: parsedPost.content.lockAmount,
            unlock_height: parsedPost.content.unlockHeight,
            is_locked: !!parsedPost.content.unlockHeight
        };

        console.log('Created base post data:', {
            txid: postData.txid,
            content: postData.content.substring(0, 50),
            author: postData.author_address,
            created_at: postData.created_at,
            tags: postData.tags
        });

        // Handle different post types
        if (parsedPost.voteQuestion) {
            // It's a vote post
            console.log('Processing vote post with options:', {
                question: parsedPost.voteQuestion.question,
                optionsCount: parsedPost.voteQuestion.optionsCount,
                totalLockAmount: parsedPost.voteQuestion.totalLockAmount
            });

            const voteData: PostCreateInput = {
                ...postData,
                is_vote: true,
                vote_options: {
                    create: parsedPost.voteOptions?.map(opt => ({
                        txid: `${parsedPost.txid}-${opt.text.optionIndex}`,
                        post_txid: parsedPost.txid,
                        content: opt.text.optionText,
                        author_address: opt.text.author,
                        created_at: new Date(parsedPost.createdAt),
                        lock_amount: opt.lock.lockAmount,
                        lock_duration: opt.lock.lockDuration,
                        tags: []
                    })) || []
                }
            };

            console.log('Creating vote post with options:', {
                optionsCount: voteData.vote_options?.create.length,
                options: voteData.vote_options?.create.map(opt => ({
                    content: opt.content,
                    lockAmount: opt.lock_amount,
                    lockDuration: opt.lock_duration
                }))
            });

            await prisma.post.create({
                data: voteData
            });
            console.log('Vote post created successfully');

        } else if (imageData) {
            // It's an image post
            console.log('Processing image post:', {
                mediaType: imageData.type,
                imageSource: imageData.source
            });

            const imagePost: PostCreateInput = {
                ...postData,
                media_type: imageData.type,
                raw_image_data: imageData.data,
                image_source: imageData.source,
                image_format: imageData.type.split('/')[1]
            };

            await prisma.post.create({
                data: imagePost
            });
            console.log('Image post created successfully');

        } else {
            // Regular post
            console.log('Processing regular post');
            await prisma.post.create({
                data: postData
            });
            console.log('Regular post created successfully');
        }

    } catch (error) {
        console.error('Error processing MAP transaction:', error);
    }
}

const client = new JungleBusClient("junglebus.gorillapool.io", {
    useSSL: true,
    protocol: "json",
    onConnected(ctx) {
        console.log("Connected to JungleBus", ctx);
    },
    onConnecting(ctx) {
        console.log("Connecting to JungleBus", ctx);
    },
    onDisconnected(ctx) {
        console.log("Disconnected from JungleBus", ctx);
    },
    onError(ctx) {
        console.error("JungleBus error:", ctx);
    }
});

const onPublish = async function(tx: JungleBusTransaction) {
    try {
        await processMapTransaction(tx);
    } catch (error) {
        console.error('Error in onPublish:', error);
    }
};

const onStatus = function(message: ControlMessage) {
    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
        console.log('Block processing completed');
    }
};

const onError = function(error: any) {
    console.error('JungleBus subscription error:', error);
};

const onMempool = async function(tx: JungleBusTransaction) {
    try {
        await processMapTransaction(tx);
    } catch (error) {
        console.error('Error in onMempool:', error);
    }
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
        console.log('Starting JungleBus service from block 883536...');
        const subscription = await client.Subscribe(
            "2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09",
            883536, // Start from block 883536
            onPublish,
            onStatus,
            onError,
            onMempool
        );

        // Monitor block height and disconnect after reaching target
        const intervalId = setInterval(async () => {
            const currentBlock = subscription.GetCurrentBlock();
            console.log(`Current block: ${currentBlock}`);
            
            // Keep running indefinitely - removed the target block check
        }, 60000); // Log current block every minute

    } catch (error) {
        console.error("Error starting JungleBus service:", error);
        await prisma.$disconnect();
        process.exit(1);
    }
})();

export { client, onPublish, onStatus, onError, onMempool }; 