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

            logger.debug('Starting transaction parse', { txid });

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

            // Try to parse outputs for protocol data
            if (tx.transaction?.outputs) {
                logger.debug('Processing transaction outputs', { 
                    txid, 
                    outputCount: tx.transaction.outputs.length 
                });

                for (const [index, output] of tx.transaction.outputs.entries()) {
                    try {
                        // First try to identify LOCK/UNLOCK protocols directly
                        if (output.outputScript.includes(this.LOCK_PROTOCOL)) {
                            logger.debug('LOCK protocol detected', { 
                                txid,
                                outputIndex: index,
                                outputScript: output.outputScript
                            });
                            parsedTx.type = 'lock';
                            parsedTx.protocol = this.LOCK_PROTOCOL;
                            parsedTx.content = {
                                outputScript: output.outputScript,
                                outputIndex: index,
                                value: output.value
                            };
                            // Try to parse lock amount and duration
                            parsedTx.lockLike = {
                                lockAmount: output.value,
                                lockDuration: 0  // Need to extract this from script
                            };
                            logger.debug('Found LOCK protocol', { txid, outputIndex: index });
                            break;
                        } else if (output.outputScript.includes(this.UNLOCK_PROTOCOL)) {
                            logger.debug('UNLOCK protocol detected', {
                                txid,
                                outputIndex: index,
                                outputScript: output.outputScript
                            });
                            parsedTx.type = 'unlock';
                            parsedTx.protocol = this.UNLOCK_PROTOCOL;
                            parsedTx.content = {
                                outputScript: output.outputScript,
                                outputIndex: index,
                                value: output.value
                            };
                            logger.debug('Found UNLOCK protocol', { txid, outputIndex: index });
                            break;
                        }

                        // Then try BMAP parsing
                        const bmapData = await this.bmap.transformTx({
                            tx: {
                                h: txid,
                                out: [{
                                    s: output.outputScript,
                                    i: index
                                }]
                            }
                        });

                        if (bmapData && bmapData.length > 0) {
                            const bData = bmapData[0];
                            logger.debug('Found BMAP data', { 
                                txid, 
                                outputIndex: index,
                                dataType: bData.type || 'unknown',
                                keys: Object.keys(bData)
                            });

                            // Transform BMAP data to our format
                            parsedTx.type = bData.type || 'B';
                            parsedTx.protocol = 'B';
                            parsedTx.content = bData;

                            // Check for vote data
                            if (bData.vote) {
                                parsedTx.voteOption = {
                                    questionId: bData.vote.questionId,
                                    index: bData.vote.optionIndex,
                                    content: bData.vote.content
                                };
                            } else if (bData.voteQuestion) {
                                parsedTx.voteQuestion = {
                                    question: bData.voteQuestion.question,
                                    totalOptions: bData.voteQuestion.options.length,
                                    optionsHash: bData.voteQuestion.optionsHash
                                };
                            }
                            break;
                        }
                    } catch (error) {
                        // Continue to next output if this one fails
                        logger.debug('Failed to parse output script', {
                            txid,
                            outputIndex: index,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
            } else {
                logger.debug('No outputs found in transaction', { txid });
            }

            // Log parsing result
            if (parsedTx.type !== 'unknown') {
                logger.info('Successfully parsed transaction', {
                    txid,
                    type: parsedTx.type,
                    protocol: parsedTx.protocol,
                    content: parsedTx.content
                });
            } else {
                logger.debug('No recognized protocols found in transaction', { txid });
            }

            return parsedTx;
        } catch (error) {
            logger.error('Failed to parse transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                tx: JSON.stringify(tx)
            });
            return null;
        }
    }
}