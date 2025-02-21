import { BMAP, TransformTx } from 'bmapjs';
import { Transaction, ParsedTransaction } from './types';
import { logger } from '../utils/logger';

export class TransactionParser {
    private bmap: BMAP;
    private readonly LOCK_PROTOCOL = 'LOCK';
    private readonly UNLOCK_PROTOCOL = 'UNLOCK';

    constructor() {
        this.bmap = new BMAP();
        const bmapExports = Object.keys(BMAP);
        logger.info('TransactionParser initialized', {
            bmapAvailable: !!this.bmap,
            bmapExports,
            bmapVersion: this.bmap.version || 'unknown'
        });
    }

    public async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            const txid = tx.transaction?.hash || tx.id;
            if (!txid) {
                logger.warn('Transaction has no id', { tx: JSON.stringify(tx) });
                return null;
            }

            logger.debug('Starting transaction parse', { 
                txid,
                hasTransaction: !!tx.transaction,
                hasBlock: !!tx.block,
                inputCount: tx.transaction?.inputs?.length || 0,
                outputCount: tx.transaction?.outputs?.length || 0,
                blockHeight: tx.block?.height,
                blockTime: tx.block?.timestamp
            });

            // Extract basic transaction data
            const parsedTx: ParsedTransaction = {
                txid,
                type: 'unknown',
                protocol: 'MAP',  // Default protocol
                content: {},
                senderAddress: tx.transaction?.inputs?.[0]?.outputScript,
                blockHeight: tx.block?.height,
                blockTime: tx.block?.timestamp ? new Date(tx.block.timestamp) : undefined,
                sequence: tx.transaction?.sequence || 0,
                parentSequence: 0  // Default to 0 for now
            };

            logger.debug('Initial transaction data extracted', {
                txid,
                type: parsedTx.type,
                protocol: parsedTx.protocol,
                blockHeight: parsedTx.blockHeight,
                blockTime: parsedTx.blockTime,
                senderAddress: parsedTx.senderAddress?.substring(0, 50) + '...'
            });

            // Try to parse outputs for protocol data
            if (tx.transaction?.outputs) {
                for (const [index, output] of tx.transaction.outputs.entries()) {
                    try {
                        logger.debug('Processing output', {
                            txid,
                            outputIndex: index,
                            outputValue: output.value,
                            scriptLength: output.outputScript?.length || 0,
                            scriptPreview: output.outputScript?.substring(0, 50) + '...'
                        });

                        // First try to identify LOCK/UNLOCK protocols directly
                        if (output.outputScript?.includes(this.LOCK_PROTOCOL)) {
                            logger.info('LOCK protocol detected', { 
                                txid,
                                outputIndex: index,
                                outputValue: output.value,
                                scriptPreview: output.outputScript?.substring(0, 50) + '...'
                            });
                            parsedTx.type = 'lock';
                            parsedTx.protocol = this.LOCK_PROTOCOL;
                            parsedTx.content = {
                                outputScript: output.outputScript,
                                outputIndex: index,
                                value: output.value
                            };
                            break;
                        } else if (output.outputScript?.includes(this.UNLOCK_PROTOCOL)) {
                            logger.info('UNLOCK protocol detected', {
                                txid,
                                outputIndex: index,
                                outputValue: output.value,
                                scriptPreview: output.outputScript?.substring(0, 50) + '...'
                            });
                            parsedTx.type = 'unlock';
                            parsedTx.protocol = this.UNLOCK_PROTOCOL;
                            parsedTx.content = {
                                outputScript: output.outputScript,
                                outputIndex: index,
                                value: output.value
                            };
                            break;
                        }

                        // Then try BMAP parsing
                        logger.debug('Attempting BMAP parsing', {
                            txid,
                            outputIndex: index,
                            scriptLength: output.outputScript?.length || 0,
                            scriptPreview: output.outputScript?.substring(0, 50) + '...'
                        });

                        // Transform transaction data into BMAP format
                        const bmapTx: TransformTx = {
                            tx: {
                                h: txid,
                                out: tx.transaction?.outputs?.map((out, i) => ({
                                    i,  // output index
                                    s: out.outputScript || '',  // output script
                                    e: {  // extra data
                                        v: out.value || 0,  // value in satoshis
                                        a: out.address || ''  // output address if available
                                    }
                                })) || []
                            },
                            // Add input data if available
                            in: tx.transaction?.inputs?.map((input, i) => ({
                                i,  // input index
                                s: input.inputScript || '',  // input script
                                e: {  // extra data
                                    a: input.address || '',  // input address if available
                                    h: input.previousTransactionHash || '',  // previous tx hash
                                    i: input.previousTransactionOutputIndex || 0  // previous tx output index
                                }
                            })) || []
                        };

                        logger.debug('Transformed transaction for BMAP', {
                            txid,
                            outputCount: bmapTx.tx.out.length,
                            inputCount: bmapTx.in?.length || 0,
                            hasScripts: bmapTx.tx.out.some(o => o.s?.length > 0)
                        });

                        const bmapData = await this.bmap.transformTx(bmapTx);

                        if (bmapData && bmapData.length > 0) {
                            const bData = bmapData[0];
                            logger.info('BMAP data parsed successfully', { 
                                txid, 
                                outputIndex: index,
                                dataType: bData.type || 'unknown',
                                keys: Object.keys(bData),
                                hasVote: !!bData.vote,
                                hasVoteQuestion: !!bData.voteQuestion,
                                contentLength: JSON.stringify(bData).length
                            });

                            // Transform BMAP data to our format
                            parsedTx.type = bData.type || 'B';
                            parsedTx.protocol = 'B';
                            parsedTx.content = bData;
                            break;
                        } else {
                            logger.debug('No BMAP data found in output', {
                                txid,
                                outputIndex: index
                            });
                        }
                    } catch (error) {
                        logger.error('Failed to parse output script', {
                            txid,
                            outputIndex: index,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            stack: error instanceof Error ? error.stack : undefined,
                            scriptPreview: output.outputScript?.substring(0, 50) + '...'
                        });
                    }
                }
            } else {
                logger.debug('No outputs found in transaction', { txid });
            }

            // Log final parsed transaction state
            if (parsedTx.type !== 'unknown') {
                logger.info('Successfully parsed transaction', {
                    txid,
                    type: parsedTx.type,
                    protocol: parsedTx.protocol,
                    hasContent: Object.keys(parsedTx.content || {}).length > 0,
                    contentKeys: Object.keys(parsedTx.content || {}),
                    blockHeight: parsedTx.blockHeight,
                    blockTime: parsedTx.blockTime
                });
                return parsedTx;
            } else {
                logger.debug('No recognized protocols found in transaction', { 
                    txid,
                    blockHeight: parsedTx.blockHeight,
                    blockTime: parsedTx.blockTime
                });
                return null;
            }
        } catch (error) {
            logger.error('Failed to parse transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                txid: tx.transaction?.hash || tx.id,
                blockHeight: tx.block?.height
            });
            return null;
        }
    }
}