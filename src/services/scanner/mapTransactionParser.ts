import { JungleBusTransaction, ParsedPost } from './types';
import { TransactionDecoder } from '../parser/transactionDecoder';
import { MAPProtocolHandler } from '../parser/mapProtocolHandler';
import { OpReturnData } from '../parser/types';

const decoder = new TransactionDecoder();
const mapHandler = new MAPProtocolHandler();

function hexToString(hex: string): string {
    try {
        const bytes = Buffer.from(hex, 'hex');
        return bytes.toString('utf-8');
    } catch (e) {
        console.error('Failed to decode hex:', e);
        return '';
    }
}

export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    console.log('Parsing transaction:', { 
        id: tx.id, 
        blockHeight: tx.block_height,
        outputCount: tx.outputs?.length || 0,
        hasRawTx: !!tx.transaction
    });

    // First parse the raw transaction data if it exists
    if (tx.transaction) {
        try {
            // Decode the raw transaction data
            const rawTx = Buffer.from(tx.transaction, 'base64');
            console.log('Raw transaction data (hex):', rawTx.toString('hex').substring(0, 100) + '...');

            // Parse outputs directly from raw transaction
            tx.outputs = [];
            let offset = 0;

            // Skip version (4 bytes)
            offset += 4;

            // Read input count (VarInt)
            let inputCount = rawTx.readUInt8(offset);
            offset += 1;

            if (inputCount === 0xfd) {
                inputCount = rawTx.readUInt16LE(offset);
                offset += 2;
            } else if (inputCount === 0xfe) {
                inputCount = rawTx.readUInt32LE(offset);
                offset += 4;
            } else if (inputCount === 0xff) {
                throw new Error('64-bit VarInt not supported');
            }

            // Skip inputs
            for (let i = 0; i < inputCount; i++) {
                // Previous transaction hash (32 bytes)
                offset += 32;
                // Previous output index (4 bytes)
                offset += 4;

                // Script length (VarInt)
                let scriptLength = rawTx.readUInt8(offset);
                offset += 1;
                if (scriptLength === 0xfd) {
                    scriptLength = rawTx.readUInt16LE(offset);
                    offset += 2;
                } else if (scriptLength === 0xfe) {
                    scriptLength = rawTx.readUInt32LE(offset);
                    offset += 4;
                } else if (scriptLength === 0xff) {
                    throw new Error('64-bit VarInt not supported');
                }

                // Skip script
                offset += scriptLength;

                // Sequence (4 bytes)
                offset += 4;
            }

            // Read output count (VarInt)
            let outputCount = rawTx.readUInt8(offset);
            offset += 1;
            if (outputCount === 0xfd) {
                outputCount = rawTx.readUInt16LE(offset);
                offset += 2;
            } else if (outputCount === 0xfe) {
                outputCount = rawTx.readUInt32LE(offset);
                offset += 4;
            } else if (outputCount === 0xff) {
                throw new Error('64-bit VarInt not supported');
            }

            console.log('Parsing outputs:', { outputCount });

            // Parse each output
            for (let i = 0; i < outputCount; i++) {
                // Read value (8 bytes)
                const value = rawTx.readBigUInt64LE(offset);
                offset += 8;

                // Read script length (VarInt)
                let scriptLength = rawTx.readUInt8(offset);
                offset += 1;
                if (scriptLength === 0xfd) {
                    scriptLength = rawTx.readUInt16LE(offset);
                    offset += 2;
                } else if (scriptLength === 0xfe) {
                    scriptLength = rawTx.readUInt32LE(offset);
                    offset += 4;
                } else if (scriptLength === 0xff) {
                    throw new Error('64-bit VarInt not supported');
                }

                // Read script
                const script = rawTx.slice(offset, offset + scriptLength);
                offset += scriptLength;

                console.log(`Output ${i}:`, {
                    value: value.toString(),
                    scriptLength,
                    script: script.toString('hex')
                });

                tx.outputs.push({
                    value: Number(value),
                    script: script.toString('hex')
                });
            }

            console.log('Parsed outputs:', tx.outputs);
        } catch (e) {
            console.error('Failed to parse raw transaction:', e);
            if (e instanceof Error) {
                console.error('Error stack:', e.stack);
            }
            return null;
        }
    }

    // 2. Decode all outputs
    const decodedOutputs: OpReturnData[] = (tx.outputs || []).map((output, index) => {
        try {
            // Get the script from transaction data
            const scriptHex = output.script;
            console.log(`Decoding output ${index}:`, { 
                scriptHex,
                value: output.value,
                scriptLength: scriptHex?.length || 0
            });
            
            if (!scriptHex) {
                console.log(`No script found in output ${index}`);
                return {
                    protocols: [],
                    content: '',
                    metadata: {}
                };
            }

            // Check if this is an OP_RETURN output (starts with 0063 for ORD protocol)
            if (!scriptHex.startsWith('0063')) {
                console.log(`Output ${index} is not an ORD protocol output`);
                return {
                    protocols: [],
                    content: '',
                    metadata: {}
                };
            }

            // Parse ORD protocol data
            // Format: 0063 + 03 + 6f7264 (ord) + ...
            const ordData = scriptHex.slice(6); // Skip 0063 and length byte
            console.log(`ORD data for output ${index}:`, ordData);

            // Try to decode the data parts
            let offset = 0;
            const data: Record<string, string> = {};

            while (offset < ordData.length) {
                // Read length
                const length = parseInt(ordData.slice(offset, offset + 2), 16);
                offset += 2;

                // Read key
                const key = Buffer.from(ordData.slice(offset, offset + length * 2), 'hex').toString('utf8');
                offset += length * 2;

                // Read value length
                const valueLength = parseInt(ordData.slice(offset, offset + 2), 16);
                offset += 2;

                // Read value
                const value = Buffer.from(ordData.slice(offset, offset + valueLength * 2), 'hex').toString('utf8');
                offset += valueLength * 2;

                data[key] = value;
                console.log(`Decoded pair:`, { key, value });
            }

            console.log(`Decoded ORD data:`, data);

            // Check if this is a lockd.app MAP protocol output
            if (data.app === 'lockd.app') {
                return {
                    protocols: ['MAP', 'ORD'],
                    content: data.content || '',
                    metadata: {
                        type: data.type || '',
                        postId: data.postId || '',
                        optionIndex: data.optionIndex || '',
                        lockAmount: data.lockAmount || '',
                        lockDuration: data.lockDuration || '',
                        timestamp: data.timestamp || '',
                        totalOptions: data.totalOptions || '',
                        version: data.version || '',
                        sequence: data.sequence || '',
                        parentSequence: data.parentSequence || '',
                        optionsHash: data.optionsHash || '',
                        tags: data.tags || '[]'
                    }
                };
            }

            return {
                protocols: [],
                content: '',
                metadata: {}
            };
        } catch (e) {
            console.error(`Failed to decode output ${index}:`, e);
            if (e instanceof Error) {
                console.error('Error stack:', e.stack);
            }
            return {
                protocols: [],
                content: '',
                metadata: {}
            };
        }
    });

    console.log('Decoded outputs:', decodedOutputs);

    // 3. Parse with MAP handler
    console.log('Parsing with MAP handler...');
    const parsedPost = await mapHandler.parseTransaction(tx, decodedOutputs);

    if (!parsedPost) {
        console.log('MAP handler returned null');
        return null;
    }

    return parsedPost;
}