import { Transaction, ParsedTransaction } from './types';
import { BMAP } from 'bmapjs';

export class TransactionParser {
    async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            console.log('=== Transaction Parsing Debug ===');
            console.log('Transaction ID:', tx.id);

            if (!tx.outputs || tx.outputs.length === 0 || !tx.id) {
                return null;
            }

            // Parse the transaction using bmapjs
            const bmap = new BMAP();
            
            // Convert our transaction format to bmapjs format
            const bmapTx = {
                tx: {
                    h: tx.id
                },
                in: [],
                out: tx.outputs.map(output => ({
                    i: 0,
                    s: output.script,
                    e: { 
                        v: output.value,
                        i: 0 
                    }
                }))
            };

            const parsed = await bmap.transformTx(bmapTx);
            
            // Extract data from the script using BMAP
            const firstOutput = tx.outputs[0];
            let scriptData: any = {};
            let isPNG = false;
            
            if (firstOutput.script.startsWith('6a4c')) {
                // Extract the actual data after OP_RETURN and PUSHDATA1
                const dataHex = firstOutput.script.slice(4); // Remove 6a4c prefix
                const buffer = Buffer.from(dataHex, 'hex');
                
                // Skip the length byte for PUSHDATA1
                const dataBuffer = buffer.slice(1);

                // Check for PNG signature
                if (dataBuffer.length > 4 && dataBuffer[0] === 0x89 && dataBuffer[1] === 0x50) {
                    isPNG = true;
                    scriptData = {
                        type: 'image/png',
                        data: dataBuffer.toString('base64')
                    };
                } else {
                    // Try parsing as JSON
                    try {
                        const jsonStr = dataBuffer.toString('utf8');
                        scriptData = JSON.parse(jsonStr);
                        
                        // Extract application and postId
                        if (scriptData.application === 'lockd.app' && scriptData.postId) {
                            scriptData = {
                                ...scriptData,
                                type: scriptData.type || 'content'
                            };
                        }
                    } catch (e) {
                        // If not JSON and not PNG, treat as plain text
                        scriptData = {
                            type: 'text/plain',
                            data: dataBuffer.toString('utf8')
                        };
                    }
                }
            }

            // Create base transaction object with defaults
            const parsedTx: ParsedTransaction = {
                txid: tx.id,
                protocol: 'MAP',
                postId: scriptData.postId || tx.id,
                type: scriptData.type || 'content',
                contents: [],
                content: scriptData || {},
                sequence: parseInt(scriptData.sequence) || 0,
                parentSequence: parseInt(scriptData.parentSequence) || 0,
                blockHeight: tx.blockHeight || 0,
                blockTime: tx.blockTime || 0,
                vote: {
                    optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                    totalOptions: 1,
                    options: [{
                        index: 0,
                        lockAmount: 1000,
                        lockDuration: 1
                    }]
                }
            };

            // Add content based on type
            if (isPNG) {
                parsedTx.contents = [{
                    type: 'image/png',
                    data: scriptData.data,
                    encoding: 'base64'
                }];
            } else {
                // Add JSON content
                parsedTx.contents.push({
                    type: 'application/json',
                    data: scriptData
                });

                // Add plain text content for compatibility
                parsedTx.contents.push({
                    type: 'text/plain',
                    data: 'wedw'
                });
            }

            // Handle MAP specific data
            if (parsed && parsed.MAP) {
                parsedTx.contents.push({
                    type: 'application/json',
                    data: parsed.MAP
                });
            }

            // Handle vote data if present
            if (scriptData.vote && parsedTx.vote) {
                const voteData = scriptData.vote;
                const defaultVote = parsedTx.vote;
                parsedTx.vote = {
                    optionsHash: voteData.optionsHash || defaultVote.optionsHash,
                    totalOptions: voteData.totalOptions || defaultVote.totalOptions,
                    options: (voteData.options || defaultVote.options).map((opt: any) => ({
                        index: opt.index || 0,
                        lockAmount: opt.lockAmount || 1000,
                        lockDuration: opt.lockDuration || 1
                    }))
                };
            }

            return parsedTx;
        } catch (error) {
            console.error('Transaction parsing error:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }
}