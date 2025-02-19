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
                blockHeight: tx.block?.height,
                timestamp: tx.block?.timestamp,
                data: {}
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
                            parsedTx.type = 'lock';
                            parsedTx.data = {
                                protocol: this.LOCK_PROTOCOL,
                                script: output.outputScript
                            };
                            logger.debug('Found LOCK protocol', { txid, outputIndex: index });
                            break;
                        } else if (output.outputScript.includes(this.UNLOCK_PROTOCOL)) {
                            parsedTx.type = 'unlock';
                            parsedTx.data = {
                                protocol: this.UNLOCK_PROTOCOL,
                                script: output.outputScript
                            };
                            logger.debug('Found UNLOCK protocol', { txid, outputIndex: index });
                            break;
                        }

                        // Then try BMAP parsing
                        const bData = await this.bmap.transformTx({
                            tx: {
                                h: txid,
                                out: [{
                                    s: output.outputScript,
                                    i: index
                                }]
                            }
                        });

                        if (bData && bData.length > 0) {
                            logger.debug('Found BMAP data', { 
                                txid, 
                                outputIndex: index,
                                dataType: bData[0].type || 'unknown'
                            });

                            // Found B protocol data
                            parsedTx.type = 'B';
                            parsedTx.data = bData[0];
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
                    hasData: !!parsedTx.data
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