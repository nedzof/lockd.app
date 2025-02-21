import { logger } from '../utils/logger.js';
import { ParsedTransaction } from '../shared/types.js';
import * as bsv from 'bsv';

interface DecodedTransaction {
    version: number;
    inputs: {
        index: number;
        prevTxId: string;
        outputIndex: number;
        sequenceNumber: number;
        script: string;
    }[];
    outputs: {
        index: number;
        satoshis: number;
        script: string;
        opReturn: string | null;
        decodedData?: any;
    }[];
    locktime: number;
}

export class TransactionParser {
    constructor() {
        logger.info('TransactionParser initialized', {
            bmapAvailable: true,
            bmapExports: [],
            bmapVersion: 'unknown'
        });
    }

    private decodeTransaction(txHex: string): DecodedTransaction | null {
        try {
            // Create transaction from hex
            const tx = new bsv.Transaction(txHex);
            
            // Object to store decoded data
            const decodedData: DecodedTransaction = {
                version: tx.version,
                inputs: tx.inputs.map(input => ({
                    script: input.script.toHex(),
                    prevTxId: input.prevTxId.toString('hex'),
                    outputIndex: input.outputIndex,
                    sequenceNumber: input.sequenceNumber
                })),
                outputs: tx.outputs.map(output => ({
                    script: output.script.toHex(),
                    satoshis: output.satoshis
                })),
                locktime: tx.nLockTime
            };

            return decodedData;
        } catch (error) {
            logger.error('Failed to decode transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txHex
            });
            return null;
        }
    }

    private extractLockProtocolData(tx: any): { 
        isLockProtocol: boolean;
        lockAmount?: string;
        lockDuration?: string;
        postId?: string;
        content?: string;
        voteOptions?: string[];
        voteQuestion?: string;
        image?: Buffer;
        imageMetadata?: {
            filename: string;
            contentType: string;
        };
    } {
        const isLockApp = tx.data?.some((d: string) => d === 'app=lockd.app');
        const lockAmount = tx.data?.find((d: string) => d.startsWith('lockamount='))?.split('=')[1];
        const lockDuration = tx.data?.find((d: string) => d.startsWith('lockduration='))?.split('=')[1];
        const postId = tx.data?.find((d: string) => d.startsWith('postid='))?.split('=')[1];
        const contentItems = tx.data
            ?.filter((d: string) => d.startsWith('content='))
            .map((d: string) => d.split('content=')[1]);

        // Extract vote options and question
        const voteOptions = tx.data
            ?.filter((d: string) => d.startsWith('voteoption='))
            .map((d: string) => d.split('voteoption=')[1]);
        
        const voteQuestion = tx.data
            ?.find((d: string) => d.startsWith('votequestion='))
            ?.split('votequestion=')[1];

        // Extract image data and metadata if present
        const imageData = tx.data
            ?.find((d: string) => d.startsWith('image='))
            ?.split('image=')[1];

        const filename = tx.data
            ?.find((d: string) => d.startsWith('filename='))
            ?.split('filename=')[1];

        const contentType = tx.data
            ?.find((d: string) => d.startsWith('contenttype='))
            ?.split('contenttype=')[1];

        let image: Buffer | undefined;
        let imageMetadata: { filename: string; contentType: string; } | undefined;

        if (imageData && filename && contentType) {
            try {
                image = Buffer.from(imageData, 'base64');
                imageMetadata = {
                    filename,
                    contentType
                };
                logger.debug('Image data extracted', {
                    filename,
                    contentType,
                    size: image.length
                });
            } catch (error) {
                logger.error('Failed to decode image data', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    filename,
                    contentType
                });
            }
        }

        const content = contentItems?.length > 0 ? contentItems.join(' ') : undefined;

        logger.debug('LOCK protocol detection', {
            isLockApp,
            lockAmount,
            lockDuration,
            postId,
            hasAllRequired: isLockApp && lockAmount && lockDuration,
            voteOptionsCount: voteOptions?.length,
            hasVoteQuestion: !!voteQuestion,
            hasImage: !!image,
            imageFilename: filename
        });

        return {
            isLockProtocol: isLockApp && !!lockAmount && !!lockDuration,
            lockAmount,
            lockDuration,
            postId,
            content,
            voteOptions: voteOptions?.length ? voteOptions : undefined,
            voteQuestion,
            image,
            imageMetadata
        };
    }

    public async parseTransaction(tx: any): Promise<ParsedTransaction | null> {
        try {
            logger.debug('Raw transaction data', {
                id: tx.id,
                block_height: tx.block_height,
                block_time: tx.block_time,
                addresses: tx.addresses,
                outputCount: tx.outputs?.length,
                dataCount: tx.data?.length,
                hasData: !!tx.data,
                hasOutputs: !!tx.outputs
            });

            // First try to extract LOCK protocol data from tx.data
            const lockData = this.extractLockProtocolData(tx);

            if (lockData.isLockProtocol) {
                logger.info('Found LOCK protocol data', {
                    txid: tx.id,
                    lockAmount: lockData.lockAmount,
                    lockDuration: lockData.lockDuration,
                    postId: lockData.postId,
                    voteOptionsCount: lockData.voteOptions?.length,
                    hasImage: !!lockData.image,
                    imageMetadata: lockData.imageMetadata
                });

                let content = lockData.content;

                // If no content in tx.data, try to decode from outputs
                if (!content && Array.isArray(tx.outputs)) {
                    const decodedTx = tx.outputs.some((o: string) => /^[0-9a-fA-F]+$/.test(o)) ? 
                        this.decodeTransaction(tx.outputs[0]) : null;

                    if (decodedTx) {
                        logger.debug('Decoded transaction data', {
                            outputCount: decodedTx.outputs.length,
                            hasOpReturn: decodedTx.outputs.some(o => o.opReturn !== null)
                        });

                        // Try to find content in OP_RETURN data
                        for (const output of decodedTx.outputs) {
                            if (output.opReturn) {
                                content = output.opReturn;
                                logger.debug('Content extracted from OP_RETURN', {
                                    outputIndex: output.index,
                                    content
                                });
                                break;
                            }
                        }
                    }
                }

                const result: ParsedTransaction = {
                    txid: tx.id,
                    type: 'lock',
                    protocol: 'LOCK',
                    blockHeight: tx.block_height,
                    blockTime: tx.block_time,
                    metadata: {
                        postId: lockData.postId || tx.id,
                        content: content || '',
                        lockAmount: Number(lockData.lockAmount),
                        lockDuration: Number(lockData.lockDuration),
                        timestamp: Date.now(),
                        voteOptions: lockData.voteOptions,
                        voteQuestion: lockData.voteQuestion,
                        image: lockData.image,
                        imageMetadata: lockData.imageMetadata
                    }
                };

                logger.info('Successfully parsed LOCK transaction', {
                    txid: result.txid,
                    blockHeight: result.blockHeight,
                    metadata: {
                        ...result.metadata,
                        image: lockData.image ? `${lockData.image.length} bytes` : undefined,
                        imageMetadata: lockData.imageMetadata
                    }
                });

                return result;
            }

            return null;
        } catch (error) {
            logger.error('Error parsing transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid: tx.id
            });
            return null;
        }
    }
}