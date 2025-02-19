import { Transaction, ParsedTransaction, RawTransaction } from './types';
import bmap from 'bmapjs';
import axios from 'axios';

export class TransactionParser {
    private isLockdTransaction(map: any): boolean {
        const isLockd = map?.app === 'lockd.app';
        console.log('Checking if Lockd transaction:', {
            app: map?.app,
            isLockd,
            mapKeys: map ? Object.keys(map) : [],
            fullMap: JSON.stringify(map)
        });
        return isLockd;
    }

    async parseTransaction(tx: RawTransaction): Promise<ParsedTransaction[] | null> {
        try {
            console.log('Starting transaction parse', {
                hasId: !!tx.tx?.h,
                outputs: tx.out?.map(o => ({
                    script: o.s?.slice(0, 32),
                    length: o.s?.length,
                    isOpReturn: o.s?.includes('OP_RETURN')
                }))
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
            for (const opReturnOutput of opReturnOutputs) {
                // Parse the OP_RETURN data
                let hexData = '';
                try {
                    if (opReturnOutput.s.includes('OP_FALSE OP_RETURN')) {
                        // Handle OP_FALSE OP_RETURN format
                        const parts = opReturnOutput.s.split('OP_FALSE OP_RETURN ');
                        if (parts.length !== 2) {
                            console.log('Invalid OP_FALSE OP_RETURN format');
                            continue;
                        }
                        hexData = parts[1].trim();
                    } else if (opReturnOutput.s.includes('OP_RETURN')) {
                        // Handle OP_RETURN format
                        const parts = opReturnOutput.s.split('OP_RETURN ');
                        if (parts.length !== 2) {
                            console.log('Invalid OP_RETURN format');
                            continue;
                        }
                        hexData = parts[1].trim();
                    } else if (opReturnOutput.s.startsWith('6a')) {
                        // Handle raw hex format (6a prefix)
                        hexData = opReturnOutput.s.slice(2); // Remove 6a prefix
                    } else {
                        console.log('Unrecognized output format:', opReturnOutput.s.slice(0, 32));
                        continue;
                    }

                    // Clean up the hex data
                    hexData = hexData.replace(/\s+/g, ''); // Remove any whitespace
                    if (hexData.length % 2 !== 0) {
                        console.log('Invalid hex data length:', hexData.length);
                        continue;
                    }

                    console.log('Processing hex data:', {
                        hexData: hexData.slice(0, 32),
                        length: hexData.length,
                        cleaned: true
                    });

                    // Try to decode the hex data
                    const decoded = Buffer.from(hexData, 'hex').toString('utf8');
                    console.log('Hex decoding details:', {
                        hexData: hexData.slice(0, 32),
                        decodedString: decoded.slice(0, 32),
                        decodedLength: decoded.length,
                        fullDecoded: decoded
                    });

                    // Try to parse the data as JSON
                    try {
                        // First try to find a SET command with lockd.app
                        const lockdMatch = decoded.match(/SET\x03app\tlockd\.app/);
                        if (lockdMatch) {
                            // Parse the binary format
                            const fields: Record<string, string> = {};
                            let pos = 0;
                            
                            while (pos < decoded.length) {
                                // Skip non-printable characters
                                while (pos < decoded.length && decoded.charCodeAt(pos) < 32) {
                                    pos++;
                                }
                                
                                // Read field name
                                let fieldName = '';
                                while (pos < decoded.length && decoded.charCodeAt(pos) >= 32) {
                                    fieldName += decoded[pos];
                                    pos++;
                                }
                                
                                // Skip separator
                                pos++;
                                
                                // Read field value
                                let fieldValue = '';
                                while (pos < decoded.length && decoded.charCodeAt(pos) >= 32) {
                                    fieldValue += decoded[pos];
                                    pos++;
                                }
                                
                                if (fieldName && fieldValue) {
                                    fields[fieldName] = fieldValue;
                                }
                            }
                            
                            console.log('Parsed binary format:', fields);
                            
                            if (fields.app === 'lockd.app') {
                                let content: any = {};
                                if (fields.content) {
                                    try {
                                        content = JSON.parse(fields.content);
                                    } catch (e) {
                                        content = { text: fields.content };
                                    }
                                }
                                
                                let tags: string[] = [];
                                if (fields.tags) {
                                    try {
                                        tags = JSON.parse(fields.tags);
                                    } catch (e) {
                                        console.warn('Failed to parse tags:', e);
                                    }
                                }
                                
                                parsedTransactions.push({
                                    txid: tx.tx.h,
                                    type: fields.type || 'content',
                                    blockHeight: tx.blk?.i,
                                    blockTime: tx.blk?.t,
                                    metadata: {
                                        application: fields.app,
                                        postId: fields.postId,
                                        type: fields.type,
                                        content,
                                        tags
                                    }
                                });
                            }
                        } else {
                            // Try to find a JSON object in the decoded string
                            const jsonMatch = decoded.match(/\{.*\}/);
                            if (jsonMatch) {
                                const jsonStr = jsonMatch[0];
                                console.log('Found JSON object in decoded string:', jsonStr.slice(0, 100));
                                
                                const json = JSON.parse(jsonStr);
                                console.log('Parsed JSON successfully:', {
                                    json: JSON.stringify(json),
                                    app: json.app,
                                    type: json.type
                                });

                                if (this.isLockdTransaction(json)) {
                                    parsedTransactions.push({
                                        txid: tx.tx.h,
                                        type: json.type || 'content',
                                        blockHeight: tx.blk?.i,
                                        blockTime: tx.blk?.t,
                                        metadata: {
                                            application: json.app,
                                            postId: json.postId,
                                            type: json.type,
                                            content: json.content,
                                            tags: json.tags || []
                                        }
                                    });
                                }
                            } else {
                                console.log('No JSON object or lockd.app data found in decoded string');
                            }
                        }
                    } catch (jsonError) {
                        console.error('Failed to parse data:', {
                            error: jsonError instanceof Error ? jsonError.message : 'Unknown error',
                            data: decoded.slice(0, 100),
                            hexData: hexData.slice(0, 100)
                        });
                        continue;
                    }
                } catch (hexError) {
                    console.error('Hex decoding failed:', {
                        error: hexError instanceof Error ? hexError.message : 'Unknown hex error',
                        rawScript: opReturnOutput.s.slice(0, 100),
                        hexData: hexData.slice(0, 100)
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
                stack: error instanceof Error ? error.stack : undefined
            });
            return null;
        }
    }
}