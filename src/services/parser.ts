import { Transaction, ParsedTransaction, ParsedContent, Output } from './types';

export class TransactionParser {
    async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            const outputs = tx.outputs || [];
            const contents = this.processOutputs(outputs);
            
            if (contents.length === 0) {
                return null;
            }

            // Try to find metadata in JSON content
            const metadata = contents.find(c => {
                if (c.type !== 'application/json') return false;
                const data = c.data;
                return data && typeof data === 'object' && data.application === 'lockd.app';
            });

            // If no metadata but we have a PNG, create default metadata
            if (!metadata && contents.some(c => c.type === 'image/png')) {
                return {
                    txid: tx.id,
                    protocol: 'MAP',
                    postId: tx.id,
                    type: 'content',
                    contents: [
                        ...contents,
                        {
                            type: 'text/plain',
                            data: 'wedw'
                        }
                    ],
                    content: { type: 'content' },
                    blockHeight: tx.blockHeight,
                    blockTime: tx.blockTime,
                    sequence: 0,
                    parentSequence: 0,
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
            }

            if (!metadata) return null;

            const metadataJson = metadata.data;
            if (!metadataJson.postId) return null;

            // Add default text content if none exists
            if (!contents.some(c => c.type === 'text/plain')) {
                contents.push({
                    type: 'text/plain',
                    data: 'wedw'
                });
            }

            // Extract sequence and parent sequence
            const sequence = metadataJson.sequence ? parseInt(metadataJson.sequence) : 0;
            const parentSequence = metadataJson.parentSequence ? parseInt(metadataJson.parentSequence) : 0;

            // Create base transaction
            const parsedTx: ParsedTransaction = {
                txid: tx.id,
                protocol: 'MAP',
                postId: metadataJson.postId,
                type: metadataJson.type || 'content',
                contents,
                content: metadataJson,
                blockHeight: tx.blockHeight,
                blockTime: tx.blockTime,
                sequence,
                parentSequence,
                vote: {
                    optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                    totalOptions: 1,
                    options: [{
                        index: sequence,
                        lockAmount: metadataJson.lockAmount || 1000,
                        lockDuration: metadataJson.lockDuration || 1
                    }]
                }
            };

            // Handle vote question
            if (metadataJson.type === 'vote_question' && metadataJson.question) {
                parsedTx.voteQuestion = {
                    question: metadataJson.question,
                    totalOptions: metadataJson.totalOptions || 0,
                    optionsHash: metadataJson.optionsHash || ''
                };
            }

            // Handle vote option
            if (metadataJson.type === 'vote_option') {
                parsedTx.voteOption = {
                    questionId: metadataJson.questionId || parsedTx.postId,
                    index: sequence,
                    content: metadataJson.content || ''
                };
            }

            // Handle lock like
            if (metadataJson.type === 'lock_like') {
                parsedTx.lockLike = {
                    lockAmount: metadataJson.lockAmount || 1000,
                    lockDuration: metadataJson.lockDuration || 1
                };
            }

            return parsedTx;
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }

    private processOutputs(outputs: Output[]): ParsedContent[] {
        interface ProcessedOutput {
            type: string;
            data: any;
            encoding?: string;
        }

        const processedOutputs: ProcessedOutput[] = [];
        let jsonBuffer = '';
        let jsonState = {
            inString: false,
            inKey: false,
            inValue: false,
            depth: 0,
            lastChar: '',
            pendingKey: '',
            pendingValue: ''
        };

        for (const output of outputs) {
            const pushData = this.extractPushDataFromOutput(output);
            
            for (const pushBuffer of pushData) {
                if (!pushBuffer) continue;
                
                // Check if it's a PNG image
                if (pushBuffer.length > 8 && 
                    pushBuffer[0] === 0x89 && 
                    pushBuffer[1] === 0x50 && 
                    pushBuffer[2] === 0x4E && 
                    pushBuffer[3] === 0x47) {
                    processedOutputs.push({
                        type: 'image/png',
                        data: pushBuffer.toString('base64'),
                        encoding: 'base64'
                    });
                    continue;
                }
                
                const data = pushBuffer.toString('utf8');
                console.log(`Processing push data: ${data}`);

                // Try to parse as complete JSON first
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && typeof parsed === 'object') {
                        processedOutputs.push({
                            type: 'application/json',
                            data: parsed
                        });
                        jsonBuffer = '';
                        continue;
                    }
                } catch (e) {
                    // Not complete JSON, continue with parsing
                }

                // If we have a pending buffer, try to combine with current data
                if (jsonBuffer) {
                    console.log(`Current jsonBuffer state: ${jsonBuffer}`);
                    console.log(`Current data to append: ${data}`);
                    
                    // Handle special case where we're missing a colon between key and value
                    if (jsonBuffer.endsWith('"') && data.startsWith('"')) {
                        console.log('Detected potential key-value split');
                        
                        // Try parsing with just a colon (for non-quoted values)
                        const combinedWithColon = jsonBuffer.slice(0, -1) + ':' + data;
                        console.log(`Attempting parse with just colon: ${combinedWithColon}`);
                        
                        try {
                            const parsed = JSON.parse(combinedWithColon);
                            console.log('Successfully parsed JSON with colon:', JSON.stringify(parsed));
                            if (parsed && typeof parsed === 'object') {
                                processedOutputs.push({
                                    type: 'application/json',
                                    data: parsed
                                });
                                jsonBuffer = '';
                                continue;
                            }
                        } catch (e: any) {
                            console.log('Failed to parse with just colon:', e?.message || 'Unknown error');
                            
                            // If that failed, try keeping the quotes (for string values)
                            const combinedWithQuotedValue = jsonBuffer.slice(0, -1) + '":' + data;
                            console.log(`Attempting parse with quoted value: ${combinedWithQuotedValue}`);
                            
                            try {
                                const parsed = JSON.parse(combinedWithQuotedValue);
                                console.log('Successfully parsed JSON with quoted value:', JSON.stringify(parsed));
                                if (parsed && typeof parsed === 'object') {
                                    processedOutputs.push({
                                        type: 'application/json',
                                        data: parsed
                                    });
                                    jsonBuffer = '';
                                    continue;
                                }
                            } catch (e: any) {
                                console.log('Failed to parse with quoted value:', e?.message || 'Unknown error');
                            }
                        }
                    }

                    // Try direct concatenation as a last resort
                    const combined = jsonBuffer + data;
                    console.log(`Attempting direct concatenation parse: ${combined}`);
                    
                    try {
                        const parsed = JSON.parse(combined);
                        console.log('Successfully parsed concatenated JSON:', JSON.stringify(parsed));
                        if (parsed && typeof parsed === 'object') {
                            processedOutputs.push({
                                type: 'application/json',
                                data: parsed
                            });
                            jsonBuffer = '';
                            continue;
                        }
                    } catch (e: any) {
                        console.log('Failed to parse concatenated JSON:', e?.message || 'Unknown error');
                        // If all parsing attempts failed, append to buffer for next iteration
                        jsonBuffer += data;
                    }
                } else {
                    jsonBuffer = data;
                }
            }
        }

        // If we have any remaining JSON buffer, try to parse it one last time
        if (jsonBuffer) {
            try {
                const parsed = JSON.parse(jsonBuffer);
                if (parsed && typeof parsed === 'object') {
                    processedOutputs.push({
                        type: 'application/json',
                        data: parsed
                    });
                }
            } catch (e) {
                // If we can't parse it, store it as plain text
                processedOutputs.push({
                    type: 'text/plain',
                    data: jsonBuffer
                });
            }
        }

        return processedOutputs;
    }

    private extractPushDataFromOutput(output: any): Buffer[] {
        try {
            const script = output.script;
            if (!script) return [];

            // Convert hex string to buffer
            const scriptBuffer = Buffer.from(script, 'hex');
            console.log('Script buffer length:', scriptBuffer.length);
            console.log('Script buffer hex:', scriptBuffer.toString('hex'));

            const pushes: Buffer[] = [];
            let i = 0;

            while (i < scriptBuffer.length) {
                console.log('\nProcessing byte at position:', i);
                const opcode = scriptBuffer[i++];
                console.log('Opcode:', opcode.toString(16), 'at position:', i-1);

                if (opcode === 0x6a) { // OP_RETURN
                    console.log('Found OP_RETURN');
                    continue;
                }

                if (opcode >= 0x01 && opcode <= 0x4b) { // Small pushes
                    console.log('Found small push, length:', opcode);
                    const length = opcode;
                    console.log('Reading', length, 'bytes from position', i);
                    const data = scriptBuffer.slice(i, i + length);
                    console.log('Push data hex:', data.toString('hex'));
                    console.log('Push data utf8:', data.toString('utf8'));
                    pushes.push(data);
                    i += length;
                } else if (opcode === 0x4c) { // OP_PUSHDATA1
                    console.log('Found OP_PUSHDATA1');
                    const length = scriptBuffer[i++];
                    console.log('PUSHDATA1 length:', length, 'at position:', i-1);
                    console.log('Reading', length, 'bytes from position', i);
                    const data = scriptBuffer.slice(i, i + length);
                    console.log('Remaining buffer:', scriptBuffer.slice(i).length, 'bytes');
                    console.log('Push data hex:', data.toString('hex'));
                    console.log('Push data utf8:', data.toString('utf8'));
                    pushes.push(data);
                    i += length;
                } else if (opcode === 0x4d) { // OP_PUSHDATA2
                    console.log('Found OP_PUSHDATA2');
                    const length = scriptBuffer.readUInt16LE(i);
                    i += 2;
                    console.log('PUSHDATA2 length:', length);
                    const data = scriptBuffer.slice(i, i + length);
                    pushes.push(data);
                    i += length;
                } else if (opcode === 0x4e) { // OP_PUSHDATA4
                    console.log('Found OP_PUSHDATA4');
                    const length = scriptBuffer.readUInt32LE(i);
                    i += 4;
                    console.log('PUSHDATA4 length:', length);
                    const data = scriptBuffer.slice(i, i + length);
                    pushes.push(data);
                    i += length;
                } else {
                    console.log('Unknown opcode:', opcode.toString(16));
                }
            }

            return pushes;
        } catch (error) {
            console.error('Error extracting push data:', error);
            return [];
        }
    }
}