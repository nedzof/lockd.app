import { DbClient } from './dbClient.js';
import { logger } from '../utils/logger.js';
import * as bsv from 'bsv';
import { ParsedTransaction, LockProtocolData, JungleBusResponse } from '../shared/types.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';

// Helper function to extract text content from transactions
export function extractTextContent(tx: JungleBusResponse): string[] {
    const contents: string[] = [];
    tx.data.forEach(item => {
        if (item.startsWith('content=')) {
            const content = item.split('=')[1];
            if (content) {
                contents.push(content);
            }
        }
    });
    return contents;
}

// Helper function to extract vote data from transactions
export function extractVoteData(tx: JungleBusResponse): { 
    question?: string, 
    options?: { text: string, lockAmount: number, lockDuration: number, optionIndex: number }[],
    totalOptions?: number,
    optionsHash?: string,
    content_type?: string 
} {
    const voteData: { 
        question?: string, 
        options?: { text: string, lockAmount: number, lockDuration: number, optionIndex: number }[],
        totalOptions?: number,
        optionsHash?: string,
        content_type?: string 
    } = {};
    
    // Check if this is a vote transaction
    const isVoteQuestion = tx.data.some(d => d.startsWith('type=vote_question'));
    const isVoteOption = tx.data.some(d => d.startsWith('type=vote_option'));
    const isVoteType = tx.data.some(d => d.startsWith('content_type=vote'));
    
    if (isVoteQuestion || isVoteOption || isVoteType) {
        // Set content_type for vote posts
        voteData.content_type = 'vote';
        
        // Extract vote question
        const questionContent = tx.data.find(d => d.startsWith('content='))?.split('=')[1];
        if (questionContent) {
            voteData.question = questionContent;
        }

        // Extract total options and hash
        const totalOptionsStr = tx.data.find(d => d.startsWith('totaloptions='))?.split('=')[1];
        if (totalOptionsStr) {
            voteData.totalOptions = parseInt(totalOptionsStr);
        }

        const optionsHash = tx.data.find(d => d.startsWith('optionshash='))?.split('=')[1];
        if (optionsHash) {
            voteData.optionsHash = optionsHash;
        }

        // Extract vote options
        const optionIndices = tx.data.filter(d => d.startsWith('optionindex=')).map(d => parseInt(d.split('=')[1]));
        if (optionIndices.length > 0) {
            // Get all content items
            const contents = tx.data
                .filter(d => d.startsWith('content='))
                .map(d => d.split('=')[1]);

            voteData.options = optionIndices.map(index => ({
                text: contents[index + 1] || contents[0] || '', // index + 1 because first content is the question
                lockAmount: parseInt(tx.data.find(d => d.startsWith('lockamount='))?.split('=')[1] || '0'),
                lockDuration: parseInt(tx.data.find(d => d.startsWith('lockduration='))?.split('=')[1] || '0'),
                optionIndex: index
            }));
        }
    }
    
    return voteData;
}

export class TransactionParser {
    private jungleBus: JungleBusClient;
    private imageData: Buffer | null = null;
    private metadata: any = {};

    constructor(private dbClient: DbClient) {
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });

        // Initialize JungleBus client
        this.jungleBus = new JungleBusClient('https://junglebus.gorillapool.io');
    }

    // Process image data and save to database
    private async processImage(imageData: Buffer, metadata: any, txid: string): Promise<void> {
        try {
            logger.debug('Starting image processing', {
                txid,
                hasImageData: !!imageData,
                metadataKeys: metadata ? Object.keys(metadata) : [],
                contentType: metadata?.contentType
            });

            if (!imageData || !metadata.contentType) {
                throw new Error('Invalid image data or content type');
            }

            // Log dbClient details before calling saveImage
            logger.debug('DbClient before saveImage', {
                dbClientType: typeof this.dbClient,
                dbClientMethods: Object.keys(this.dbClient),
                dbClientInstance: this.dbClient instanceof DbClient
            });

            // Save image data using DbClient
            await this.dbClient.saveImage({
                txid,
                imageData,
                contentType: metadata.contentType,
                filename: metadata.filename || 'image.jpg',
                width: metadata.width,
                height: metadata.height,
                size: imageData.length
            });

            logger.info('Successfully processed and saved image', {
                txid,
                contentType: metadata.contentType,
                size: imageData.length
            });
        } catch (error) {
            logger.error('Failed to process image', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid
            });
            throw error;
        }
    }

    private extractImageFromBsvTx(tx: any): { imageData: Buffer; metadata: any } | null {
        try {
            logger.debug('📦 Processing transaction for image:', {
                hasData: !!tx.data,
                dataType: tx.data ? typeof tx.data : 'undefined',
                isArray: Array.isArray(tx.data),
                dataLength: tx.data?.length,
                txKeys: Object.keys(tx),
                firstFewItems: tx.data?.slice(0, 3)
            });

            if (!tx.data || !Array.isArray(tx.data)) {
                logger.debug('❌ Invalid transaction data structure');
                return null;
            }

            let imageData: Buffer | null = null;
            let metadata: any = {};
            let foundImage = false;
            let rawImageData: string | null = null;

            // Known image format headers
            const imageHeaders = {
                jpeg: { header: [0xFF, 0xD8, 0xFF], contentType: 'image/jpeg', maxSize: 20 * 1024 * 1024 },
                png: { header: [0x89, 0x50, 0x4E, 0x47], contentType: 'image/png', maxSize: 20 * 1024 * 1024 },
                gif: { header: [0x47, 0x49, 0x46, 0x38], contentType: 'image/gif', maxSize: 10 * 1024 * 1024 },
                webp: { header: [0x52, 0x49, 0x46, 0x46], contentType: 'image/webp', maxSize: 15 * 1024 * 1024 },
                bmp: { header: [0x42, 0x4D], contentType: 'image/bmp', maxSize: 10 * 1024 * 1024 },
                tiff: { header: [0x49, 0x49, 0x2A, 0x00], contentType: 'image/tiff', maxSize: 20 * 1024 * 1024 }
            };

            // Enhanced base64 validation
            const isValidBase64 = (str: string): boolean => {
                if (str.length % 4 !== 0) return false;
                const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
                return base64Regex.test(str);
            };

            // Enhanced image data validation
            const validateImageData = (buffer: Buffer, format: string): boolean => {
                if (!buffer || buffer.length === 0) return false;
                const formatInfo = imageHeaders[format as keyof typeof imageHeaders];
                if (!formatInfo) return false;
                
                // Check size limits
                if (buffer.length > formatInfo.maxSize) {
                    logger.warn(`Image size ${buffer.length} bytes exceeds limit of ${formatInfo.maxSize} bytes for ${format}`);
                    return false;
                }
                
                return true;
            };

            // Try to extract image data from different sources in order of preference
            const extractImageFromBuffer = (buffer: Buffer): Buffer | null => {
                if (!buffer || buffer.length === 0) {
                    logger.debug('❌ Empty buffer provided');
                    return null;
                }

                for (const [format, { header, contentType }] of Object.entries(imageHeaders)) {
                    for (let i = 0; i < Math.min(buffer.length - header.length, 1024); i++) {
                        if (header.every((byte, j) => buffer[i + j] === byte)) {
                            const extractedData = buffer.slice(i);
                            
                            if (!validateImageData(extractedData, format)) {
                                logger.debug(`❌ Invalid ${format} image data`, {
                                    size: extractedData.length,
                                    startPosition: i
                                });
                                continue;
                            }

                            if (!metadata.contentType) {
                                metadata.contentType = contentType;
                            }
                            
                            logger.debug(`✅ Found valid ${format.toUpperCase()} image`, {
                                size: extractedData.length,
                                startPosition: i,
                                contentType
                            });
                            
                            return extractedData;
                        }
                    }
                }
                return null;
            };

            // First pass: collect metadata and image indicators
            for (const item of tx.data) {
                if (typeof item !== 'string') continue;

                if (item.includes('=')) {
                    const [key, value] = item.split('=');
                    const keyLower = key.toLowerCase();

                    // Handle both regular and MAP protocol fields
                    switch(keyLower) {
                        case 'contenttype':
                        case 'map_content_type':
                            if (value.startsWith('image/')) {
                                metadata.contentType = value;
                                foundImage = true;
                                logger.debug('🖼️ Found image content type', { contentType: value });
                            }
                            break;
                        case 'map_content':
                            // Store map_content regardless of current foundImage status
                            // We might find out it's an image later when we see map_content_type
                            rawImageData = value;
                            logger.debug('📦 Found map_content data');
                            break;
                        case 'filename':
                        case 'map_file_name':
                            metadata.filename = value;
                            break;
                        case 'imagewidth':
                        case 'map_image_width':
                            metadata.width = parseInt(value);
                            break;
                        case 'imageheight':
                        case 'map_image_height':
                            metadata.height = parseInt(value);
                            break;
                        case 'imagesize':
                        case 'map_file_size':
                            metadata.size = parseInt(value);
                            break;
                        case 'type':
                            if (value === 'image') {
                                foundImage = true;
                                logger.debug('🖼️ Found image type indicator');
                            }
                            break;
                        case 'map_type':
                            if (value === 'image') {
                                foundImage = true;
                                logger.debug('🖼️ Found MAP image indicator');
                            }
                            break;
                        case 'imagedata':
                        case 'map_image_data':
                            rawImageData = value;
                            logger.debug('📸 Found image data in field', { field: key });
                            break;
                        default:
                            // Check if this is base64 encoded image data
                            if (item.match(/^[A-Za-z0-9+/=]+$/)) {
                                try {
                                    // Try to decode as base64
                                    Buffer.from(item, 'base64');
                                    imageData = item;
                                } catch (e) {
                                    // Not valid base64, ignore
                                }
                            }
                    }
                }
            }

            // Log the final state before attempting extraction
            logger.debug('🎯 Pre-extraction state:', {
                foundImage,
                hasRawData: !!rawImageData,
                contentType: metadata.contentType,
                rawDataLength: rawImageData?.length
            });

            // Try to extract image data from different sources in order of preference
            // 1. Try imagedata/map_content field first
            if (!imageData && rawImageData && foundImage) {
                try {
                    let base64Data = rawImageData;
                    
                    // Handle different base64 formats
                    if (rawImageData.startsWith('data:')) {
                        const matches = rawImageData.match(/^data:([^;]+);base64,(.+)$/);
                        if (matches) {
                            metadata.contentType = matches[1];
                            base64Data = matches[2];
                        }
                    }

                    // Try to decode base64 even if it doesn't have the data: prefix
                    if (!isValidBase64(base64Data)) {
                        // Try to clean up the base64 string
                        base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
                        if (!isValidBase64(base64Data)) {
                            logger.debug('❌ Invalid base64 data format after cleanup');
                            return null;
                        }
                    }

                    // Ensure we're working with a Buffer
                    const buffer = Buffer.from(base64Data, 'base64');
                    imageData = extractImageFromBuffer(buffer);
                    
                    if (imageData) {
                        logger.debug('✅ Successfully extracted image from data field', {
                            size: imageData.length,
                            type: metadata.contentType
                        });
                    } else {
                        logger.debug('❌ Failed to validate extracted image data');
                    }
                } catch (e) {
                    logger.debug('❌ Failed to process image data field:', e);
                }
            }

            // 2. Try transaction field
            if (!imageData && tx.transaction && foundImage) {
                try {
                    const buffer = Buffer.from(tx.transaction, 'base64');
                    imageData = extractImageFromBuffer(buffer);
                } catch (e) {
                    logger.debug('❌ Failed to process transaction field:', e);
                }
            }

            // 3. Try outputs field
            if (!imageData && tx.outputs && foundImage) {
                try {
                    for (const output of tx.outputs) {
                        if (output.script?.asm) {
                            // Try to extract base64 data from script
                            const matches = output.script.asm.match(/OP_RETURN ([A-Za-z0-9+/=]+)/);
                            if (matches) {
                                const buffer = Buffer.from(matches[1], 'base64');
                                imageData = extractImageFromBuffer(buffer);
                                if (imageData) break;
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('❌ Failed to process outputs:', e);
                }
            }

            // Log final result
            logger.debug('🎯 Image extraction result:', {
                foundImage,
                hasImageData: !!imageData,
                hasContentType: !!metadata.contentType,
                metadata
            });

            if (imageData && metadata.contentType) {
                return {
                    imageData,
                    metadata: {
                        ...metadata,
                        encoding: 'base64',
                        size: imageData.length
                    }
                };
            }

            if (foundImage && !imageData) {
                logger.warn('Could not find image data in transaction', {
                    contentType: metadata.contentType
                });
            }
        } catch (error) {
            logger.error('Error extracting image from transaction:', error);
        }
        return null;
    }

    private extractLockProtocolData(data: string[], tx: any): LockProtocolData | null {
        try {
            if (!Array.isArray(data)) {
                logger.debug('❌ Data is not an array', { data });
                return null;
            }

            // Log raw data for debugging
            logger.debug('📝 Processing data array', { 
                data,
                dataLength: data.length
            });

            // Check if this is a LOCK protocol transaction
            const isLockApp = data.some(item => item === 'app=lockd.app');
            logger.debug('🔍 Checking for LOCK protocol', { 
                isLockApp,
                firstFewItems: data.slice(0, 5)
            });

            if (!isLockApp) {
                return null;
            }

            // Extract metadata
            const metadata: any = {
                postId: null,
                lockAmount: 0,  
                lockDuration: 0,  
                content: null,
                voteOptions: [],
                voteQuestion: null,
                image: null,
                imageMetadata: null,
                optionsHash: null,
                content_type: null
            };

            // Try to extract image from BSV transaction
            const imageResult = this.extractImageFromBsvTx(tx);
            if (imageResult) {
                metadata.image = imageResult.imageData;
                metadata.imageMetadata = imageResult.metadata;
            }

            // Initialize image metadata if needed
            let imageData: string | null = null;
            let imageMetadata: { [key: string]: any } = {};

            // Check if this is a vote transaction
            const isVoteQuestion = data.some(item => item.startsWith('type=vote_question'));
            const isVoteOption = data.some(item => item.startsWith('type=vote_option'));
            const isVoteType = data.some(item => item.startsWith('content_type=vote'));
            
            // If this is a vote transaction, set the type accordingly
            if (isVoteQuestion || isVoteOption || isVoteType) {
                metadata.isVote = true;
                metadata.content_type = 'vote';
            }

            // Process each data item
            data.forEach((item: string) => {
                const [key, value] = item.split('=');
                if (!key) return;

                switch (key.toLowerCase()) {
                    case 'postid':
                        metadata.postId = value;
                        break;
                    case 'lockamount':
                        metadata.lockAmount = parseInt(value, 10) || 0;  
                        break;
                    case 'lockduration':
                        metadata.lockDuration = parseInt(value, 10) || 0;  
                        break;
                    case 'content':
                        if (isVoteQuestion && !metadata.voteQuestion) {
                            metadata.voteQuestion = value;
                        } else if (isVoteOption) {
                            metadata.voteOptions.push(value);
                        }
                        metadata.content = value;
                        break;
                    case 'totaloptions':
                        metadata.totalOptions = parseInt(value, 10);
                        break;
                    case 'optionshash':
                        metadata.optionsHash = value;
                        break;
                    case 'content_type':
                        metadata.content_type = value;
                        if (value === 'vote') {
                            metadata.isVote = true;
                        }
                        break;
                    case 'type':
                        if (value === 'vote' || value === 'vote_question' || value === 'vote_option') {
                            metadata.isVote = true;
                            metadata.content_type = 'vote';
                        }
                        break;
                    // Image related fields
                    case 'contenttype':
                        imageMetadata.contentType = value;
                        break;
                    case 'imageheight':
                        imageMetadata.height = parseInt(value, 10);
                        break;
                    case 'imagewidth':
                        imageMetadata.width = parseInt(value, 10);
                        break;
                    case 'imagesize':
                        imageMetadata.size = parseInt(value, 10);
                        break;
                    case 'filename':
                        imageMetadata.filename = value;
                        break;
                    case 'format':
                        imageMetadata.format = value;
                        break;
                    case 'encoding':
                        imageMetadata.encoding = value;
                        break;
                    case 'type':
                        if (value === 'image') {
                            imageMetadata.isImage = true;
                        }
                        break;
                    default:
                        // Check if this is base64 encoded image data
                        if (item.match(/^[A-Za-z0-9+/=]+$/)) {
                            try {
                                // Try to decode as base64
                                Buffer.from(item, 'base64');
                                imageData = item;
                            } catch (e) {
                                // Not valid base64, ignore
                            }
                        }
                }
            });

            // Handle image data
            if (imageMetadata.isImage && tx.transaction) {
                try {
                    // Get raw transaction data
                    const buffer = Buffer.from(tx.transaction, 'base64');
                    
                    // Find image data markers based on content type
                    let imageBuffer: Buffer | null = null;
                    
                    if (imageMetadata.contentType?.includes('jpeg') || imageMetadata.contentType?.includes('jpg')) {
                        // Look for JPEG marker (FF D8 FF)
                        const jpegMarker = Buffer.from([0xFF, 0xD8, 0xFF]);
                        for (let i = 0; i < buffer.length - jpegMarker.length; i++) {
                            if (buffer[i] === jpegMarker[0] && 
                                buffer[i + 1] === jpegMarker[1] && 
                                buffer[i + 2] === jpegMarker[2]) {
                                imageBuffer = buffer.slice(i);
                                break;
                            }
                        }
                    } else if (imageMetadata.contentType?.includes('png')) {
                        // Look for PNG marker (89 50 4E 47)
                        const pngMarker = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
                        for (let i = 0; i < buffer.length - pngMarker.length; i++) {
                            if (buffer[i] === pngMarker[0] && 
                                buffer[i + 1] === pngMarker[1] && 
                                buffer[i + 2] === pngMarker[2] && 
                                buffer[i + 3] === pngMarker[3]) {
                                imageBuffer = buffer.slice(i);
                                break;
                            }
                        }
                    } else if (imageMetadata.contentType?.includes('gif')) {
                        // Look for GIF marker (47 49 46 38)
                        const gifMarker = Buffer.from([0x47, 0x49, 0x46, 0x38]);
                        for (let i = 0; i < buffer.length - gifMarker.length; i++) {
                            if (buffer[i] === gifMarker[0] && 
                                buffer[i + 1] === gifMarker[1] && 
                                buffer[i + 2] === gifMarker[2] && 
                                buffer[i + 3] === gifMarker[3]) {
                                imageBuffer = buffer.slice(i);
                                break;
                            }
                        }
                    }

                    if (imageBuffer) {
                        metadata.image = imageBuffer;
                        metadata.imageMetadata = {
                            contentType: imageMetadata.contentType || 'image/jpeg',
                            filename: imageMetadata.filename || `image.${imageMetadata.format || 'jpg'}`,
                            width: imageMetadata.width,
                            height: imageMetadata.height,
                            size: imageMetadata.size,
                            encoding: 'binary'
                        };
                        logger.debug('Successfully extracted image data', {
                            size: metadata.image.length,
                            metadata: metadata.imageMetadata
                        });
                    } else {
                        logger.warn('Could not find image data markers in transaction', {
                            contentType: imageMetadata.contentType
                        });
                    }
                } catch (error) {
                    logger.error('Failed to process image data', {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }

            // For vote questions, collect all content items after the first one as options
            if (isVoteQuestion) {
                const contents = data
                    .filter(item => item.startsWith('content='))
                    .map(item => item.split('=')[1]);
                
                if (contents.length > 1) {
                    metadata.voteOptions = contents.slice(1);
                    logger.debug('Found vote options', { 
                        count: metadata.voteOptions.length,
                        options: metadata.voteOptions
                    });
                }
            }

            // Validate required fields
            if (!metadata.content && !metadata.image) {
                logger.debug('Missing required content', {
                    hasContent: !!metadata.content,
                    hasImage: !!metadata.image
                });
                return null;
            }

            return metadata;
        } catch (error) {
            logger.error('Failed to extract LOCK protocol data', { error });
            return null;
        }
    }

    public async parseTransaction(txid: string): Promise<void> {
        try {
            // Check if transaction already exists
            const existingTx = await this.dbClient.getTransaction(txid);
            if (existingTx) {
                return;
            }

            const tx = await this.jungleBus.GetTransaction(txid);
            if (!tx) {
                return;
            }

            const parsedTx = this.extractLockProtocolData(tx.data, tx);
            if (!parsedTx) {
                return;
            }

            if (parsedTx.image) {
                await this.processImage(parsedTx.image, parsedTx.imageMetadata, txid);
            }

            // Determine transaction type
            let txType = 'lock';
            if (parsedTx.isVote || (parsedTx.voteOptions && parsedTx.voteOptions.length > 0) || parsedTx.content_type === 'vote') {
                txType = 'vote';
                logger.debug('Processing vote transaction', {
                    txid,
                    voteOptions: parsedTx.voteOptions,
                    isVote: parsedTx.isVote,
                    contentType: parsedTx.content_type
                });
                
                // Ensure we have vote options
                if (!parsedTx.voteOptions || parsedTx.voteOptions.length === 0) {
                    // Create default vote options if none exist
                    logger.info('Creating default vote options for vote post', { txid });
                    parsedTx.voteOptions = ['Yes', 'No', 'Maybe'];
                }
            }

            // Ensure content_type is set for vote posts
            if (txType === 'vote' && !parsedTx.content_type) {
                parsedTx.content_type = 'vote';
            }

            await this.dbClient.processTransaction({
                txid: tx.id,
                type: txType,
                protocol: 'LOCK',
                blockHeight: tx.block_height,
                blockTime: tx.block_time,
                metadata: {
                    senderAddress: tx.addresses?.[0] || null,
                    ...parsedTx
                }
            });
            logger.info('✅ Transaction saved to database', { 
                txid,
                blockHeight: tx.block_height,
                type: txType,
                hasVoteOptions: parsedTx.voteOptions && parsedTx.voteOptions.length > 0,
                contentType: parsedTx.content_type
            });
        } catch (error) {
            logger.error('❌ Failed to parse transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
}