import { logger } from '../utils/logger.js';
import { DbClient } from './dbClient.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { LockProtocolData, ParsedTransaction } from '../shared/types.js';

// Helper function to extract vote data from transactions
export function extractVoteData(tx: { data: string[] }): { 
    question?: string, 
    options?: { text: string, lock_amount: number, lock_duration: number, option_index: number }[],
    total_options?: number,
    options_hash?: string
} {
    try {
        const voteData: { 
            question?: string, 
            options?: { text: string, lock_amount: number, lock_duration: number, option_index: number }[],
            total_options?: number,
            options_hash?: string
        } = {};

        // Check if this is a vote transaction
        const isVoteQuestion = tx.data.some((d: string) => d.startsWith('type=vote_question'));
        const isVoteOption = tx.data.some((d: string) => d.startsWith('type=vote_option'));
        const isVoteType = tx.data.some((d: string) => d.startsWith('content_type=vote'));
        
        if (!isVoteQuestion && !isVoteOption && !isVoteType) {
            return {};
        }
        
        // Extract vote question
        if (isVoteQuestion) {
            const questionContent = tx.data.find((d: string) => d.startsWith('content='))?.split('=')[1];
            if (questionContent) {
                voteData.question = questionContent;
            }
        }
        
        // Extract total options
        if (isVoteQuestion) {
            const totalOptionsStr = tx.data.find((d: string) => d.startsWith('totaloptions='))?.split('=')[1];
            if (totalOptionsStr) {
                voteData.total_options = parseInt(totalOptionsStr, 10);
            }
            
            const optionsHash = tx.data.find((d: string) => d.startsWith('optionshash='))?.split('=')[1];
            if (optionsHash) {
                voteData.options_hash = optionsHash;
            }
        }
        
        // Extract vote options
        if (isVoteOption) {
            const optionIndices = tx.data.filter((d: string) => d.startsWith('optionindex=')).map((d: string) => parseInt(d.split('=')[1]));
            
            // Extract option text
            const optionTexts = tx.data
                .filter((d: string) => d.startsWith('content='))
                .map((d: string) => d.split('=')[1]);
            
            voteData.options = optionIndices.map((index: number) => ({
                text: optionTexts[0] || '',
                lock_amount: parseInt(tx.data.find((d: string) => d.startsWith('lockamount='))?.split('=')[1] || '0'),
                lock_duration: parseInt(tx.data.find((d: string) => d.startsWith('lockduration='))?.split('=')[1] || '0'),
                option_index: index
            }));
        }
        
        return voteData;
    } catch (error) {
        return {};
    }
}

export class TransactionParser {
    private dbClient: DbClient;
    private jungleBus: JungleBusClient;

    constructor(dbClient: DbClient) {
        this.dbClient = dbClient;
        
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });

        // Initialize JungleBus client
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            protocol: 'json',
            onError: (ctx) => {
                logger.error("❌ JungleBus Parser ERROR", ctx);
            }
        });
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
            const metadata: LockProtocolData = {
                post_id: '',
                lock_amount: 0,  
                lock_duration: 0,  
                content: '',
                vote_options: [],
                vote_question: '',
                image: null,
                image_metadata: {
                    filename: '',
                    content_type: '',
                }
            };

            // Check if this is a vote transaction
            const isVoteQuestion = data.some(item => item.startsWith('type=vote_question'));
            const isVoteOption = data.some(item => item.startsWith('type=vote_option'));
            const isVoteType = data.some(item => item.startsWith('content_type=vote'));
            
            // If this is a vote transaction, set the type accordingly
            if (isVoteQuestion || isVoteOption || isVoteType) {
                metadata.is_vote = true;
                metadata.content_type = 'vote';
            }

            // Process each data item
            data.forEach((item: string) => {
                const [key, value] = item.split('=');
                if (!key) return;

                switch (key.toLowerCase()) {
                    case 'postid':
                        metadata.post_id = value;
                        break;
                    case 'lockamount':
                        metadata.lock_amount = parseInt(value, 10) || 0;  
                        break;
                    case 'lockduration':
                        metadata.lock_duration = parseInt(value, 10) || 0;  
                        break;
                    case 'content':
                        if (isVoteQuestion && !metadata.vote_question) {
                            metadata.vote_question = value;
                        } else if (isVoteOption) {
                            metadata.vote_options.push(value);
                        }
                        metadata.content = value;
                        break;
                    case 'totaloptions':
                        metadata.total_options = parseInt(value, 10);
                        break;
                    case 'optionshash':
                        metadata.options_hash = value;
                        break;
                    case 'content_type':
                        metadata.content_type = value;
                        if (value === 'vote') {
                            metadata.is_vote = true;
                        }
                        break;
                    case 'type':
                        if (value === 'vote' || value === 'vote_question' || value === 'vote_option') {
                            metadata.is_vote = true;
                            metadata.content_type = 'vote';
                        }
                        break;
                    // Image related fields
                    case 'contenttype':
                        metadata.image_metadata.content_type = value;
                        break;
                    case 'imageheight':
                        metadata.image_metadata.height = parseInt(value, 10);
                        break;
                    case 'imagewidth':
                        metadata.image_metadata.width = parseInt(value, 10);
                        break;
                    case 'imagesize':
                        metadata.image_metadata.size = parseInt(value, 10);
                        break;
                    case 'filename':
                        metadata.image_metadata.filename = value;
                        break;
                    case 'format':
                        metadata.image_metadata.format = value;
                        break;
                    case 'encoding':
                        metadata.image_metadata.encoding = value;
                        break;
                    case 'type':
                        if (value === 'image') {
                            metadata.image_metadata.is_image = true;
                        }
                        break;
                    default:
                        // Check if this is base64 encoded image data
                        if (item.length > 100) {
                            try {
                                // Try to decode as base64
                                const imageBuffer = Buffer.from(item, 'base64');
                                metadata.image = imageBuffer;
                            } catch (e) {
                                // Not valid base64, ignore
                            }
                        }
                }
            });

            // Handle image data
            if (metadata.image_metadata.is_image && tx.transaction) {
                try {
                    // Get raw transaction data
                    const buffer = Buffer.from(tx.transaction, 'base64');
                    
                    // Find image data markers based on content type
                    let imageBuffer: Buffer | null = null;
                    
                    if (metadata.image_metadata.content_type?.includes('jpeg') || metadata.image_metadata.content_type?.includes('jpg')) {
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
                    } else if (metadata.image_metadata.content_type?.includes('png')) {
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
                    } else if (metadata.image_metadata.content_type?.includes('gif')) {
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
                        metadata.image_metadata = {
                            content_type: metadata.image_metadata.content_type || 'image/jpeg',
                            filename: metadata.image_metadata.filename || `image.${metadata.image_metadata.format || 'jpg'}`,
                            width: metadata.image_metadata.width,
                            height: metadata.image_metadata.height,
                            size: metadata.image_metadata.size,
                            encoding: 'binary'
                        };
                        logger.debug('Successfully extracted image data', {
                            size: metadata.image.length,
                            metadata: metadata.image_metadata
                        });
                    } else {
                        logger.warn('Could not find image data markers in transaction', {
                            contentType: metadata.image_metadata.content_type
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
                    metadata.vote_options = contents.slice(1);
                    logger.debug('Found vote options', { 
                        count: metadata.vote_options.length,
                        options: metadata.vote_options
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
            if (!txid || typeof txid !== 'string') {
                logger.error('Invalid transaction ID', { txid });
                return;
            }

            // Check if transaction already exists in database
            const existingTx = await this.dbClient.getTransaction(txid);
            if (existingTx) {
                logger.info('Transaction already processed', { txid });
                return;
            }

            const tx: any = await this.jungleBus.GetTransaction(txid);
            if (!tx) {
                logger.warn('Transaction not found in JungleBus', { txid });
                return;
            }

            // For JungleBus JSON protocol, we need to handle the data differently
            // than for the protobuf protocol
            const txData = tx.outputs || [];
            const parsedTx = this.extractLockProtocolData(txData, tx);
            if (!parsedTx) {
                logger.warn('Could not extract Lock protocol data from transaction', { txid });
                return;
            }

            if (parsedTx.image) {
                await this.processImage(parsedTx.image, parsedTx.image_metadata, txid);
            }

            // Determine transaction type
            let txType = 'lock';
            if (parsedTx.is_vote || (parsedTx.vote_options && parsedTx.vote_options.length > 0) || parsedTx.content_type === 'vote') {
                txType = 'vote';
                logger.debug('Processing vote transaction', {
                    txid,
                    vote_options: parsedTx.vote_options,
                    is_vote: parsedTx.is_vote,
                    content_type: parsedTx.content_type
                });
                
                // Ensure we have vote options
                if (!parsedTx.vote_options || parsedTx.vote_options.length === 0) {
                    // Create default vote options if none exist
                    logger.info('Creating default vote options for vote post', { txid });
                    parsedTx.vote_options = ['Yes', 'No', 'Maybe'];
                }
            }

            // Set content type for vote transactions
            if (txType === 'vote' && !parsedTx.content_type) {
                parsedTx.content_type = 'vote';
            }

            // Create the parsed transaction object to send to the database
            const parsedTransaction: ParsedTransaction = {
                txid,
                type: txType,
                protocol: 'LOCK',
                block_height: tx.block_height,
                block_time: tx.block_time,
                metadata: {
                    post_id: parsedTx.post_id,
                    content: parsedTx.content,
                    lock_amount: parsedTx.lock_amount,
                    lock_duration: parsedTx.lock_duration,
                    vote_options: parsedTx.vote_options,
                    vote_question: parsedTx.vote_question,
                    image: parsedTx.image,
                    image_metadata: parsedTx.image_metadata,
                    options_hash: parsedTx.options_hash,
                    content_type: parsedTx.content_type,
                    tags: parsedTx.tags || [],
                    sender_address: tx.addresses?.[0] || null
                }
            };

            // Process the transaction in the database
            const post = await this.dbClient.processTransaction(parsedTransaction);
            
            logger.info('Transaction processed successfully', {
                txid,
                post_id: post.id,
                block_height: tx.block_height,
                type: txType,
                has_vote_options: parsedTx.vote_options && parsedTx.vote_options.length > 0,
                content_type: parsedTx.content_type
            });
        } catch (error) {
            logger.error('❌ Failed to parse transaction', {
                txid,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }
}