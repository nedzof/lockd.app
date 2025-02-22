import { DbClient } from './dbClient.js';
import { logger } from '../utils/logger.js';
import * as bsv from 'bsv';
import { ParsedTransaction, LockProtocolData } from '../shared/types.js';

export class TransactionParser {
    constructor(private dbClient: DbClient) {
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });
    }

    private extractLockProtocolData(data: string[]): LockProtocolData | null {
        try {
            if (!Array.isArray(data)) {
                return null;
            }

            // Check if this is a LOCK protocol transaction
            const isLockApp = data.some(item => item === 'app=lockd.app');
            if (!isLockApp) {
                return null;
            }

            // Extract metadata
            const metadata: any = {
                postId: null,
                lockAmount: null,
                lockDuration: null,
                content: null,
                voteOptions: [],
                voteQuestion: null,
                image: null,
                imageMetadata: null
            };

            // Process each data item
            data.forEach((item: string, index: number) => {
                const [key, value] = item.split('=');
                if (!key) return;

                if (index === data.length - 1 && !value) {
                    // Last item with no '=' is likely the base64 image data
                    try {
                        metadata.image = Buffer.from(key, 'base64');
                        return;
                    } catch (error) {
                        logger.error('Failed to decode image data', { error });
                    }
                }

                if (!value) return;

                switch (key.toLowerCase()) {
                    case 'postid':
                        metadata.postId = value;
                        break;
                    case 'lockamount':
                        metadata.lockAmount = parseInt(value, 10);
                        break;
                    case 'lockduration':
                        metadata.lockDuration = parseInt(value, 10);
                        break;
                    case 'content':
                        metadata.content = value;
                        break;
                    case 'votequestion':
                        metadata.voteQuestion = value;
                        break;
                    case 'voteoption':
                        metadata.voteOptions.push(value);
                        break;
                    case 'imagefilename':
                        if (!metadata.imageMetadata) {
                            metadata.imageMetadata = { filename: '', contentType: '' };
                        }
                        metadata.imageMetadata.filename = value;
                        break;
                    case 'imagecontenttype':
                        if (!metadata.imageMetadata) {
                            metadata.imageMetadata = { filename: '', contentType: '' };
                        }
                        metadata.imageMetadata.contentType = value;
                        break;
                }
            });

            // Validate required fields
            if (!metadata.postId || !metadata.lockAmount || !metadata.lockDuration || !metadata.content) {
                return null;
            }

            return metadata;
        } catch (error) {
            logger.error('Failed to extract LOCK protocol data', { error });
            return null;
        }
    }

    public async parseTransaction(tx: any): Promise<ParsedTransaction | null> {
        try {
            logger.debug('Raw transaction data', {
                addresses: tx?.addresses,
                block_height: tx?.block_height,
                dataCount: tx?.data?.length,
                hasData: !!tx?.data,
                hasOutputs: !!tx?.outputs,
                id: tx?.id
            });

            // First try to extract LOCK protocol data from tx.data
            const lockData = this.extractLockProtocolData(tx.data);
            if (!lockData) {
                return null;
            }

            // Return parsed transaction data
            return {
                txid: tx.id,
                type: 'lock',
                protocol: 'LOCK',
                blockHeight: tx.block_height,
                blockTime: tx.block_time,
                senderAddress: tx.addresses?.[0] || null,
                metadata: {
                    postId: lockData.postId,
                    lockAmount: lockData.lockAmount,
                    lockDuration: lockData.lockDuration,
                    content: lockData.content,
                    voteOptions: lockData.voteOptions || [],
                    voteQuestion: lockData.voteQuestion || '',
                    image: lockData.image,
                    imageMetadata: lockData.imageMetadata,
                    senderAddress: tx.addresses?.[0] || null
                }
            };
        } catch (error) {
            logger.error('Error parsing or storing transaction', error);
            throw error;
        }
    }
}