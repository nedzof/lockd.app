import { Transaction, ParsedTransaction, RawTransaction } from './types';
import bmap from 'bmapjs';
import axios from 'axios';

export class TransactionParser {
    private isLockdTransaction(map: any): boolean {
        return map?.app === 'lockd.app';
    }

    async parseTransaction(tx: RawTransaction): Promise<ParsedTransaction[] | null> {
        try {
            console.log('Starting transaction parse', {
                hasId: !!tx.tx?.h,
                outputs: JSON.stringify(tx.out)
            });

            if (!tx.out) {
                console.log('No outputs found');
                return null;
            }

            // Find all OP_RETURN outputs
            const opReturnOutputs = tx.out.filter(output => 
                output.s && (output.s.includes('OP_RETURN') || output.s.includes('6a'))
            );

            if (opReturnOutputs.length === 0) {
                console.log('No OP_RETURN outputs found');
                return null;
            }

            console.log('Found OP_RETURN outputs:', {
                count: opReturnOutputs.length,
                outputs: opReturnOutputs.map(o => ({
                    script: o.s,
                    scriptLength: o.s.length
                }))
            });

            const parsedTransactions: ParsedTransaction[] = [];

            // Process each OP_RETURN output
            for (const opReturnOutput of opReturnOutputs) {
                // Parse the OP_RETURN data
                let hexData: string;
                try {
                    if (opReturnOutput.s.includes('OP_RETURN')) {
                        const parts = opReturnOutput.s.split('OP_RETURN ');
                        if (parts.length !== 2) {
                            console.log('Invalid OP_RETURN format');
                            continue;
                        }
                        hexData = parts[1].trim();
                    } else {
                        // Handle raw hex format (6a prefix)
                        hexData = opReturnOutput.s.slice(4); // Remove 6a prefix
                    }

                    const decoded = Buffer.from(hexData, 'hex').toString('utf8');
                    console.log('Hex decoding details:', {
                        hexData,
                        decodedString: decoded
                    });
                } catch (hexError) {
                    console.error('Hex decoding failed:', {
                        error: hexError instanceof Error ? hexError.message : 'Unknown hex error',
                        rawScript: opReturnOutput.s
                    });
                    continue;
                }

                // Parse using bmap
                try {
                    // Create a minimal transaction for bmap parsing
                    const bmapTx = {
                        tx: { h: tx.tx.h },
                        in: tx.in || [],
                        out: [{ 
                            s: opReturnOutput.s,
                            i: opReturnOutput.i,
                            e: opReturnOutput.e
                        }],
                        blk: tx.blk
                    };

                    console.log('Sending to bmap:', {
                        tx: JSON.stringify(bmapTx),
                        scriptAnalysis: {
                            length: opReturnOutput.s.length,
                            startsWithOpReturn: opReturnOutput.s.startsWith('OP_RETURN'),
                            firstFewBytes: opReturnOutput.s.slice(0, 16),
                            isValidHex: /^[0-9a-fA-F]+$/.test(opReturnOutput.s)
                        }
                    });

                    let parsedTx = await bmap.TransformTx(bmapTx);
                    console.log('Parsed with bmap:', {
                        hasMAP: !!parsedTx?.MAP,
                        mapLength: parsedTx?.MAP?.length,
                        firstMAP: parsedTx?.MAP?.[0],
                        rawParsedTx: JSON.stringify(parsedTx)
                    });

                    // Try to parse the MAP data directly if bmap fails
                    if (!parsedTx.MAP || parsedTx.MAP.length === 0) {
                        try {
                            const data = Buffer.from(hexData, 'hex').toString('utf8');
                            const json = JSON.parse(data);
                            parsedTx = { MAP: [json] };
                            console.log('Parsed JSON directly:', {
                                json: JSON.stringify(json)
                            });
                        } catch (jsonError) {
                            console.error('Failed to parse JSON:', {
                                error: jsonError instanceof Error ? jsonError.message : 'Unknown JSON error',
                                data: opReturnOutput.s
                            });
                            continue;
                        }
                    }

                    const map = parsedTx.MAP?.[0];

                    if (!map) {
                        console.log('No MAP data found');
                        continue;
                    }

                    if (!this.isLockdTransaction(map)) {
                        console.log('Not a Lockd transaction', {
                            app: map.app,
                            type: map.type,
                            map: JSON.stringify(map)
                        });
                        continue;
                    }

                    parsedTransactions.push({
                        txid: tx.tx.h,
                        type: map.type || 'content',
                        blockHeight: tx.blk?.i,
                        blockTime: tx.blk?.t,
                        metadata: {
                            application: map.app,
                            postId: map.postId,
                            type: map.type,
                            content: map.content,
                            tags: map.tags || []
                        }
                    });

                } catch (bmapError) {
                    console.error('bmap.TransformTx error:', {
                        error: bmapError instanceof Error ? bmapError.message : 'Unknown bmap error',
                        stack: bmapError instanceof Error ? bmapError.stack : undefined,
                        fullError: JSON.stringify(bmapError)
                    });
                    continue;
                }
            }

            return parsedTransactions.length > 0 ? parsedTransactions : null;

        } catch (error) {
            console.error('Error parsing transaction:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                txid: tx.tx?.h,
                stack: error instanceof Error ? error.stack : undefined,
                fullError: JSON.stringify(error)
            });
            return null;
        }
    }
}