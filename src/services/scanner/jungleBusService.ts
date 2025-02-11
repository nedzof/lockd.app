import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { Transaction, ControlMessage } from './junglebus.types.js';
import { TRANSACTION_TYPES } from './junglebus.types.js';
import { PrismaClient, type Prisma } from '@prisma/client';
import { fetchTransactionData } from '../../shared/utils/whatsOnChain';
import { parseMapData } from '../../shared/utils/mapProtocol';

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
});

// Add these type definitions at the top of the file
type JsonValue = Prisma.JsonValue;
type Post = Prisma.PostGetPayload<{}>;

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

interface DecodedTransaction {
    txid: string;
    hash: string;
    version: number;
    size: number;
    locktime: number;
    vin: Array<{
        txid: string;
        vout: number;
        scriptSig: {
            asm: string;
            hex: string;
        };
        sequence: number;
    }>;
    vout: Array<{
        value: number;
        n: number;
        scriptPubKey: {
            asm: string;
            hex: string;
            reqSigs?: number;
            type?: string;
            addresses?: string[];
        };
    }>;
    hex?: string;
}

interface ExtendedTransaction extends Omit<Transaction, 'transaction'> {
    data?: string[];
    output_types?: string[];
    contexts?: string[];
    sub_contexts?: string[];
    transaction?: string;
}

const onPublish = async function(tx: Transaction) {
    try {
        // Get full transaction data from JungleBus
        const fullTx = await client.GetTransaction(tx.id) as ExtendedTransaction;
        if (!fullTx) {
            console.log('Could not fetch transaction details:', tx.id);
            return;
        }
        
        console.log("TRANSACTION DETECTED:", JSON.stringify({
            id: fullTx.id,
            output_types: fullTx.output_types || [],
            contexts: fullTx.contexts || [],
            sub_contexts: fullTx.sub_contexts || [],
            data: fullTx.data || []
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

        // Get decoded transaction data
        const decodedTxResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${fullTx.id}`);
        if (!decodedTxResponse.ok) {
            console.error('Could not fetch decoded transaction data:', fullTx.id);
            return;
        }
        const decodedTx = (await decodedTxResponse.json()) as DecodedTransaction;

        // Extract author address from transaction outputs
        const author_address = decodedTx.vout.find((out) => 
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

        // Extract image data if present
        let imageData = null;
        if (contentType.startsWith('image/') || type === 'image') {
            console.log('Processing image transaction:', {
                txid: fullTx.id,
                contentType,
                type,
                outputTypes: fullTx.output_types,
                contexts: fullTx.contexts
            });

            // Try multiple sources for image data
            const sources = [
                {
                    name: 'ordinal',
                    fn: async () => {
                        const ordHex = findOrdinalOutput(decodedTx);
                        if (ordHex) {
                            console.log('Trying ordinal output...');
                            return extractImageFromTransaction(ordHex, 'ordinal');
                        }
                        return null;
                    }
                },
                {
                    name: 'full_tx',
                    fn: async () => {
                        if (txData.hex) {
                            console.log('Trying full transaction data...');
                            return extractImageFromTransaction(txData.hex, 'full_tx');
                        }
                        return null;
                    }
                },
                {
                    name: 'outputs',
                    fn: async () => {
                        if (!decodedTx.vout) return null;
                        for (const [index, output] of decodedTx.vout.entries()) {
                            if (output.scriptPubKey?.hex) {
                                console.log(`Trying output ${index}:`, {
                                    type: output.scriptPubKey.type,
                                    hexLength: output.scriptPubKey.hex.length
                                });
                                const result = extractImageFromTransaction(output.scriptPubKey.hex, `output_${index}`);
                                if (result) return result;
                            }
                        }
        return null;
                    }
                }
            ];

            // Try each source until we find image data
            for (const source of sources) {
                imageData = await source.fn();
                if (imageData) {
                    console.log('Successfully extracted image from source:', {
                        txid: fullTx.id,
                        source: source.name,
                        type: imageData.type,
                        dataLength: imageData.data.length,
                        dataPreview: imageData.data.substring(0, 50) + '...'
                    });
                    break;
                }
            }

            if (imageData) {
                // Add image data to metadata with proper data URI format
                mapData.imageData = `data:${imageData.type};base64,${imageData.data}`;
                // Update content type if not already set
                if (!contentType.startsWith('image/')) {
                    mapData.contentType = imageData.type;
                }
            } else {
                console.log('Failed to extract image from all sources:', {
                    txid: fullTx.id,
                    contentType,
                    type,
                    outputCount: decodedTx.vout?.length || 0
                });
            }
        }

        // Create or update post in database
        try {
            const post = await prisma.post.upsert({
                where: { txid: fullTx.id },
                create: {
                    txid: fullTx.id,
                    content,
                    author_address,
                    media_type: imageData ? imageData.type : contentType,
                    block_height: fullTx.block_height || 0,
                    amount: mapData.lockAmount ? parseInt(mapData.lockAmount) : undefined,
                    unlock_height: mapData.unlockHeight ? parseInt(mapData.unlockHeight) : undefined,
                    description: content,
                    created_at: new Date(timestamp),
                    tags: Array.isArray(tags) ? tags : JSON.parse(typeof tags === 'string' ? tags : '["lockdapp"]'),
                    metadata: {
                        ...mapData,
                        extractedImage: !!imageData
                    },
                    is_locked: !!mapData.unlockHeight,
                    lock_duration: mapData.lockDuration ? parseInt(mapData.lockDuration) : undefined,
                    raw_image_data: imageData?.data || null,
                    image_format: imageData ? imageData.type.split('/')[1] : null,
                    image_source: imageData?.source || null
                },
                update: {
                    content,
                    author_address,
                    media_type: imageData ? imageData.type : contentType,
                    block_height: fullTx.block_height || 0,
                    amount: mapData.lockAmount ? parseInt(mapData.lockAmount) : undefined,
                    unlock_height: mapData.unlockHeight ? parseInt(mapData.unlockHeight) : undefined,
                    description: content,
                    created_at: new Date(timestamp),
                    tags: Array.isArray(tags) ? tags : JSON.parse(typeof tags === 'string' ? tags : '["lockdapp"]'),
                    metadata: {
                        ...mapData,
                        extractedImage: !!imageData
                    },
                    is_locked: !!mapData.unlockHeight,
                    lock_duration: mapData.lockDuration ? parseInt(mapData.lockDuration) : undefined,
                    raw_image_data: imageData?.data || null,
                    image_format: imageData ? imageData.type.split('/')[1] : null,
                    image_source: imageData?.source || null
                }
            });
            console.log(`Successfully processed post in database:`, {
                txid: post.txid,
                block_height: post.block_height,
                is_locked: post.is_locked,
                hasImage: !!imageData,
                imageFormat: post.image_format,
                imageSource: post.image_source,
                mediaType: post.media_type
            });
            return post;
        } catch (error) {
            console.error('Error creating/updating post:', error);
            throw error;
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