import { Transaction, ParsedTransaction, RawTransaction } from './types';
import bmap from 'bmapjs';
import axios from 'axios';

export class TransactionParser {
    private isLockdTransaction(map: any): boolean {
        if (!map) return false;
        
        const isLockd = map?.app === 'lockd.app';
        console.log('Checking if Lockd transaction:', {
            app: map?.app,
            isLockd,
            type: map?.type,
            postId: map?.postId,
            hasContent: !!map?.content
        });
        return isLockd;
    }

    async parseTransaction(tx: RawTransaction): Promise<ParsedTransaction[] | null> {
        try {
            console.log('Starting transaction parse', {
                txid: tx.tx?.h,
                outputCount: tx.out?.length,
                firstOutput: tx.out?.[0]?.s?.slice(0, 32),
                addresses: tx.in?.map(input => input.e?.a)
            });

            if (!tx.out) {
                console.log('No outputs found');
                return null;
            }

            // Find all OP_RETURN outputs
            const opReturnOutputs = tx.out.filter(output => 
                output.s && (
                    output.s.includes('OP_RETURN') || 
                    output.s.includes('6a') ||
                    output.s.includes('OP_FALSE OP_RETURN')
                )
            );

            console.log('OP_RETURN outputs:', {
                count: opReturnOutputs.length,
                outputs: opReturnOutputs.map(o => ({
                    script: o.s?.slice(0, 32),
                    length: o.s?.length,
                    hasOpReturn: o.s?.includes('OP_RETURN'),
                    has6a: o.s?.includes('6a'),
                    hasOpFalse: o.s?.includes('OP_FALSE')
                }))
            });

            if (opReturnOutputs.length === 0) {
                console.log('No OP_RETURN outputs found');
                return null;
            }

            const parsedTransactions: ParsedTransaction[] = [];

            // Process each OP_RETURN output
            for (const [index, opReturnOutput] of opReturnOutputs.entries()) {
                try {
                    let data = '';
                    
                    // Extract data based on format
                    if (opReturnOutput.s.includes('OP_FALSE OP_RETURN')) {
                        const parts = opReturnOutput.s.split('OP_FALSE OP_RETURN ');
                        data = parts[1]?.trim() || '';
                    } else if (opReturnOutput.s.includes('OP_RETURN')) {
                        const parts = opReturnOutput.s.split('OP_RETURN ');
                        data = parts[1]?.trim() || '';
                    } else if (opReturnOutput.s.startsWith('6a')) {
                        data = opReturnOutput.s.slice(2);
                    }

                    if (!data) {
                        console.log('No data found in output:', {
                            index,
                            script: opReturnOutput.s.slice(0, 32)
                        });
                        continue;
                    }

                    // Try to parse as JSON
                    try {
                        // If it's hex data, decode it first
                        let jsonStr = '';
                        try {
                            const decoded = Buffer.from(data, 'hex').toString('utf8');
                            console.log('Decoded hex data:', {
                                index,
                                preview: decoded.slice(0, 100),
                                length: decoded.length
                            });
                            
                            // Look for JSON object
                            const jsonMatch = decoded.match(/\{.*\}/s);
                            if (jsonMatch) {
                                jsonStr = jsonMatch[0];
                            } else {
                                console.log('No JSON found in decoded data');
                                continue;
                            }
                        } catch (e) {
                            // If hex decoding fails, try direct JSON parsing
                            jsonStr = data;
                        }

                        const parsedData = JSON.parse(jsonStr);
                        console.log('Parsed JSON data:', {
                            index,
                            app: parsedData.app,
                            type: parsedData.type,
                            postId: parsedData.postId
                        });

                        if (this.isLockdTransaction(parsedData)) {
                            parsedTransactions.push({
                                txid: tx.tx.h,
                                type: parsedData.type || 'content',
                                blockHeight: tx.blk?.i,
                                blockTime: tx.blk?.t,
                                metadata: {
                                    application: parsedData.app,
                                    postId: parsedData.postId || `${tx.tx.h}_${index}`,
                                    type: parsedData.type || 'content',
                                    content: parsedData.content,
                                    tags: parsedData.tags || []
                                }
                            });
                            
                            console.log('Added parsed transaction:', {
                                index,
                                txid: tx.tx.h,
                                type: parsedData.type,
                                postId: parsedData.postId
                            });
                        }
                    } catch (e) {
                        console.error('Failed to parse data as JSON:', {
                            error: e instanceof Error ? e.message : 'Unknown error',
                            index,
                            data: data.slice(0, 100)
                        });
                    }
                } catch (error) {
                    console.error('Error processing output:', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        index,
                        script: opReturnOutput.s.slice(0, 100)
                    });
                }
            }

            if (parsedTransactions.length > 0) {
                console.log('Successfully parsed transactions:', {
                    count: parsedTransactions.length,
                    transactions: parsedTransactions.map(t => ({
                        txid: t.txid,
                        type: t.type,
                        postId: t.metadata.postId
                    }))
                });
            } else {
                console.log('No Lockd transactions found in outputs');
            }

            return parsedTransactions.length > 0 ? parsedTransactions : null;

        } catch (error) {
            console.error('Error parsing transaction:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                txid: tx.tx?.h,
                stack: error instanceof Error ? error.stack : undefined
            });
            return null;
        }
    }
}