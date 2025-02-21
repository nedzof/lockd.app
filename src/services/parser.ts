import { logger } from '../utils/logger.js';
import { ParsedTransaction } from '../shared/types.js';
import { Script, Transaction } from 'bsv';

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
            const tx = Transaction.fromHex(txHex);
            
            // Object to store decoded data
            const decodedData: DecodedTransaction = {
                version: tx.version,
                inputs: [],
                outputs: [],
                locktime: tx.nLockTime
            };

            // Decode inputs
            tx.inputs.forEach((input, index) => {
                decodedData.inputs.push({
                    index,
                    prevTxId: input.prevTxId.toString('hex'),
                    outputIndex: input.outputIndex,
                    sequenceNumber: input.sequenceNumber,
                    script: input.script.toHex()
                });
            });

            // Decode outputs
            tx.outputs.forEach((output, index) => {
                const outputData = {
                    index,
                    satoshis: output.satoshis,
                    script: output.script.toHex(),
                    opReturn: null as string | null,
                    decodedData: undefined as any
                };

                // Try to decode OP_RETURN data if present
                if (output.script.isDataOut()) {
                    try {
                        const data = output.script.getData().toString('utf8');
                        outputData.opReturn = data;
                        
                        // Try to parse as JSON if possible
                        try {
                            outputData.decodedData = JSON.parse(data);
                        } catch {
                            // If not JSON, keep as string
                            outputData.decodedData = data;
                        }
                    } catch (error) {
                        logger.error('Error decoding OP_RETURN data', {
                            error: error instanceof Error ? error.message : 'Unknown error',
                            outputIndex: index
                        });
                    }
                }

                decodedData.outputs.push(outputData);
            });

            logger.debug('Transaction decoded successfully', {
                version: decodedData.version,
                inputCount: decodedData.inputs.length,
                outputCount: decodedData.outputs.length,
                hasOpReturn: decodedData.outputs.some(o => o.opReturn !== null)
            });

            return decodedData;

        } catch (error) {
            logger.error('Error decoding transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txHex: txHex.substring(0, 50) + '...'
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
    } {
        const isLockApp = tx.data?.some((d: string) => d === 'app=lockd.app');
        const lockAmount = tx.data?.find((d: string) => d.startsWith('lockamount='))?.split('=')[1];
        const lockDuration = tx.data?.find((d: string) => d.startsWith('lockduration='))?.split('=')[1];
        const postId = tx.data?.find((d: string) => d.startsWith('postid='))?.split('=')[1];
        const contentItems = tx.data
            ?.filter((d: string) => d.startsWith('content='))
            .map((d: string) => d.split('content=')[1]);

        const content = contentItems?.length > 0 ? contentItems.join(' ') : undefined;

        logger.debug('LOCK protocol detection', {
            isLockApp,
            lockAmount,
            lockDuration,
            postId,
            hasAllRequired: isLockApp && lockAmount && lockDuration
        });

        return {
            isLockProtocol: isLockApp && !!lockAmount && !!lockDuration,
            lockAmount,
            lockDuration,
            postId,
            content
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
                    postId: lockData.postId
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
                        timestamp: Date.now()
                    }
                };

                logger.info('Successfully parsed LOCK transaction', {
                    txid: result.txid,
                    blockHeight: result.blockHeight,
                    metadata: result.metadata
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