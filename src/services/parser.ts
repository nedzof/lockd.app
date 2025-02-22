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
    optionsHash?: string 
} {
    const voteData: { 
        question?: string, 
        options?: { text: string, lockAmount: number, lockDuration: number, optionIndex: number }[],
        totalOptions?: number,
        optionsHash?: string 
    } = {};
    
    // Check if this is a vote transaction
    const isVoteQuestion = tx.data.some(d => d.startsWith('type=vote_question'));
    const isVoteOption = tx.data.some(d => d.startsWith('type=vote_option'));
    
    if (isVoteQuestion || isVoteOption) {
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

    constructor(private dbClient: DbClient) {
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });

        // Initialize JungleBus client
        this.jungleBus = new JungleBusClient('https://junglebus.gorillapool.io');
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
                optionsHash: null
            };

            // Initialize image metadata if needed
            let imageData: string | null = null;
            let imageMetadata: { [key: string]: any } = {};

            // Check if this is a vote transaction
            const isVoteQuestion = data.some(item => item.startsWith('type=vote_question'));
            const isVoteOption = data.some(item => item.startsWith('type=vote_option'));

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
                }
            }

            // Validate required fields
            if (!metadata.postId || !metadata.content) {
                logger.debug('Missing required fields', {
                    hasPostId: !!metadata.postId,
                    hasContent: !!metadata.content
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

            await this.dbClient.saveTransaction({
                txid: tx.id,
                type: 'lock',
                protocol: 'LOCK',
                blockHeight: tx.block_height,
                blockTime: tx.block_time,
                senderAddress: tx.addresses?.[0] || null,
                metadata: {
                    postId: parsedTx.postId,
                    lockAmount: parsedTx.lockAmount,
                    lockDuration: parsedTx.lockDuration,
                    content: parsedTx.content,
                    voteOptions: parsedTx.voteOptions || [],
                    voteQuestion: parsedTx.voteQuestion || '',
                    image: parsedTx.image,
                    imageMetadata: parsedTx.imageMetadata,
                    senderAddress: tx.addresses?.[0] || null
                }
            });
            logger.info('✅ Transaction saved to database', { 
                txid,
                blockHeight: tx.block_height
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