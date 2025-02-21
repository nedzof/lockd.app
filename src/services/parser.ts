import { BMAP, TransformTx } from 'bmapjs';
import { Transaction, ParsedTransaction } from './types';
import { logger } from '../utils/logger';

export class TransactionParser {
    private bmap: BMAP;
    private readonly LOCK_PROTOCOL = 'LOCK';
    private readonly UNLOCK_PROTOCOL = 'UNLOCK';

    constructor() {
        this.bmap = new BMAP();

        // Register core protocol handlers
        this.registerProtocolHandlers();

        // Log BMAP instance details
        logger.info('BMAP instance details', {
            hasTransformTx: typeof this.bmap.transformTx === 'function',
            hasAddProtocolHandler: typeof this.bmap.addProtocolHandler === 'function',
            protocolHandlers: Object.keys(this.bmap).filter(key => key.includes('Protocol')),
            bmapProperties: Object.getOwnPropertyNames(Object.getPrototypeOf(this.bmap)),
            bmapVersion: this.bmap.version || 'unknown'
        });

        // Try to access and log protocol handlers
        try {
            // @ts-ignore - Accessing internal property for diagnosis
            const handlers = this.bmap._handlers || [];
            logger.info('BMAP protocol handlers', {
                handlersCount: handlers.length,
                handlerNames: handlers.map((h: any) => h.name),
                handlerAddresses: handlers.map((h: any) => h.address)
            });
        } catch (error) {
            logger.warn('Could not access BMAP handlers', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }

        // Log available BMAP exports
        const bmapExports = Object.keys(BMAP);
        logger.info('BMAP exports and protocols', {
            bmapExports,
            hasDefaultProtocols: 'protocols' in BMAP,
            exportTypes: bmapExports.map(key => typeof (BMAP as any)[key])
        });

        logger.info('TransactionParser initialized', {
            bmapAvailable: !!this.bmap,
            bmapExports,
            bmapVersion: this.bmap.version || 'unknown'
        });
    }

    private registerProtocolHandlers() {
        try {
            // Register custom LOCK/UNLOCK protocol handlers
            this.bmap.addProtocolHandler({
                name: this.LOCK_PROTOCOL,
                address: '1LockXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                opReturnSchema: [
                    { name: 'protocol', type: 'string' },
                    { name: 'data', type: 'string' }
                ],
                handler: ({ dataObj, cell }) => {
                    if (cell.s?.includes(this.LOCK_PROTOCOL)) {
                        dataObj[this.LOCK_PROTOCOL] = [{
                            type: 'lock',
                            data: cell.s
                        }];
                    }
                }
            });

            this.bmap.addProtocolHandler({
                name: this.UNLOCK_PROTOCOL,
                address: '1UnlockXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                opReturnSchema: [
                    { name: 'protocol', type: 'string' },
                    { name: 'data', type: 'string' }
                ],
                handler: ({ dataObj, cell }) => {
                    if (cell.s?.includes(this.UNLOCK_PROTOCOL)) {
                        dataObj[this.UNLOCK_PROTOCOL] = [{
                            type: 'unlock',
                            data: cell.s
                        }];
                    }
                }
            });

            // Add basic MAP protocol handler
            this.bmap.addProtocolHandler({
                name: 'MAP',
                address: '1MapXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                opReturnSchema: [
                    { name: 'protocol', type: 'string' },
                    { name: 'key', type: 'string' },
                    { name: 'value', type: 'string' }
                ],
                handler: ({ dataObj, cell }) => {
                    if (cell.s?.startsWith('OP_RETURN')) {
                        const parts = cell.s.split(' ');
                        if (parts.length >= 4 && parts[1] === 'MAP') {
                            dataObj.MAP = dataObj.MAP || [];
                            dataObj.MAP.push({
                                key: parts[2],
                                value: parts[3]
                            });
                        }
                    }
                }
            });

            logger.info('Protocol handlers registered successfully', {
                protocols: [
                    'MAP',
                    this.LOCK_PROTOCOL,
                    this.UNLOCK_PROTOCOL
                ]
            });
        } catch (error) {
            logger.error('Failed to register protocol handlers', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private transformToValidBOB(tx: Transaction): any {
        try {
            if (tx.tx && tx.blk) {
                // Already in BOB format, just ensure the structure is correct
                return {
                    tx: {
                        h: tx.tx.h,
                        out: tx.tx.out.map((out: any) => ({
                            i: out.i,
                            s: out.s,
                            e: out.e || { v: 0 }
                        })),
                        in: tx.tx.in.map((input: any) => ({
                            i: input.i,
                            s: input.s,
                            e: input.e || {}
                        }))
                    },
                    blk: {
                        i: tx.blk.i,
                        h: tx.blk.h,
                        t: tx.blk.t
                    }
                };
            }

            // Transform standard format to BOB
            const bobTx = {
                tx: {
                    h: tx.transaction?.hash,
                    out: tx.transaction?.outputs?.map((out, i) => {
                        // Parse OP_RETURN data if present
                        const script = out.outputScript || '';
                        return {
                            i,
                            s: script,
                            b: script.startsWith('OP_RETURN') ? script.split(' ').slice(1).join(' ') : undefined,
                            e: {
                                v: out.value || 0,
                                a: out.address
                            }
                        };
                    }) || [],
                    in: tx.transaction?.inputs?.map((input, i) => ({
                        i,
                        s: input.inputScript || '',
                        e: {
                            a: input.address,
                            h: input.previousTransactionHash,
                            i: input.previousTransactionOutputIndex
                        }
                    })) || []
                },
                blk: tx.block ? {
                    i: tx.block.height,
                    h: tx.block.hash || 'unknown',
                    t: tx.block.timestamp
                } : undefined
            };

            logger.debug('Transformed transaction to BOB format', {
                txid: bobTx.tx.h,
                outputCount: bobTx.tx.out.length,
                inputCount: bobTx.tx.in.length,
                hasBlock: !!bobTx.blk,
                sample: {
                    firstOutput: bobTx.tx.out[0],
                    firstInput: bobTx.tx.in[0]
                }
            });

            return bobTx;
        } catch (error) {
            logger.error('Failed to transform transaction to BOB format', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                tx: JSON.stringify(tx)
            });
            throw error;
        }
    }

    private async processBMAPTransaction(tx: any): Promise<any> {
        try {
            const bmapData = await this.bmap.transformTx(tx);
            if (!bmapData) {
                logger.debug('No BMAP data found in transaction', {
                    txid: tx.tx.h,
                    outputs: tx.tx.out.map((o: any) => ({
                        script: o.s?.substring(0, 50),
                        hasB: !!o.b,
                        hasE: !!o.e
                    }))
                });
                return null;
            }

            return bmapData;
        } catch (error) {
            logger.error('BMAP processing error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                txid: tx.tx.h
            });
            return null;
        }
    }

    public async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            // Handle both standard and BOB format
            const txid = tx.transaction?.hash || tx.tx?.h || tx.id;
            if (!txid) {
                logger.warn('Transaction has no id', { tx: JSON.stringify(tx) });
                return null;
            }

            const blockHeight = tx.block?.height || tx.blk?.i;
            const blockTime = tx.block?.timestamp || tx.blk?.t;
            
            logger.debug('Starting transaction parse', {
                txid,
                blockHeight,
                blockTime,
                hasTransaction: !!(tx.transaction || tx.tx),
                hasBlock: !!(tx.block || tx.blk),
                inputCount: tx.transaction?.inputs?.length || tx.tx?.in?.length,
                outputCount: tx.transaction?.outputs?.length || tx.tx?.out?.length
            });

            // Extract initial transaction data
            const initialData: ParsedTransaction = {
                txid,
                blockHeight,
                blockTime: blockTime ? new Date(blockTime) : undefined,
                type: 'unknown',
                protocol: 'MAP',
                metadata: {},
                senderAddress: tx.transaction?.inputs?.[0]?.address || tx.tx?.in?.[0]?.e?.a
            };

            logger.debug('Initial transaction data extracted', {
                ...initialData,
                blockTime: initialData.blockTime?.toISOString(),
                senderAddress: initialData.senderAddress + '...'
            });

            // Transform to BOB format for BMAP processing
            const bobTx = this.transformToValidBOB(tx);
            const bmapData = await this.processBMAPTransaction(bobTx);

            if (bmapData) {
                logger.debug('BMAP data found', {
                    txid,
                    protocols: Object.keys(bmapData),
                    dataSize: JSON.stringify(bmapData).length
                });

                return {
                    ...initialData,
                    type: 'map',
                    protocol: 'MAP',
                    metadata: bmapData
                };
            }

            // Process outputs for other protocols
            for (const output of tx.transaction?.outputs || tx.tx?.out || []) {
                const outputScript = output.outputScript || output.s;
                const outputValue = output.value || output.e?.v || 0;
                const outputIndex = output.i || 0;

                if (!outputScript) continue;

                logger.debug('Processing output', {
                    outputIndex,
                    outputValue,
                    scriptLength: outputScript.length,
                    scriptPreview: outputScript?.substring(0, 50) + '...'
                });

                // Check for LOCK protocol
                if (outputScript.includes(this.LOCK_PROTOCOL)) {
                    logger.info('LOCK protocol detected', {
                        txid,
                        outputIndex,
                        outputValue,
                        scriptPreview: outputScript?.substring(0, 50) + '...'
                    });

                    return {
                        ...initialData,
                        type: 'lock',
                        protocol: this.LOCK_PROTOCOL,
                        metadata: {
                            protocol: this.LOCK_PROTOCOL,
                            postId: txid,
                            content: outputScript
                        }
                    };
                }

                // Check for UNLOCK protocol
                if (outputScript.includes(this.UNLOCK_PROTOCOL)) {
                    logger.info('UNLOCK protocol detected', {
                        txid,
                        outputIndex,
                        outputValue,
                        scriptPreview: outputScript?.substring(0, 50) + '...'
                    });

                    return {
                        ...initialData,
                        type: 'unlock',
                        protocol: this.UNLOCK_PROTOCOL,
                        metadata: {
                            protocol: this.UNLOCK_PROTOCOL,
                            postId: txid,
                            content: outputScript
                        }
                    };
                }
            }

            logger.debug('No recognized protocols found in transaction', {
                txid,
                blockHeight,
                blockTime: blockTime ? new Date(blockTime).toISOString() : undefined
            });

            return null;
        } catch (error) {
            logger.error('Failed to parse transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                tx: JSON.stringify(tx)
            });
            throw error;
        }
    }
}