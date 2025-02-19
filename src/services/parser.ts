import { BMAP, TransformTx } from 'bmapjs';
import { Transaction, ParsedTransaction } from './types';
import { logger } from '../utils/logger';

export class TransactionParser {
    private bmap: BMAP;

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

            // Extract basic transaction data
            const parsedTx: ParsedTransaction = {
                txid,
                type: 'unknown',
                blockHeight: tx.block?.height,
                timestamp: tx.block?.timestamp,
                data: {}
            };

            // Try to parse outputs for B protocol data
            if (tx.transaction?.outputs) {
                for (const output of tx.transaction.outputs) {
                    try {
                        const bData = await this.bmap.transformTx({
                            tx: {
                                h: txid,
                                out: [{
                                    s: output.outputScript,
                                    i: 0  // Index doesn't matter for our purposes
                                }]
                            }
                        });

                        if (bData && bData.length > 0) {
                            // Found B protocol data
                            parsedTx.type = 'B';
                            parsedTx.data = bData[0];
                            break;
                        }
                    } catch (error) {
                        // Continue to next output if this one fails
                        logger.debug('Failed to parse output script', {
                            txid,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
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