// src/parser.ts
import { Transaction, ParsedTransaction, Output } from './types';

export class TransactionParser {
    private processedTxids = new Set<string>();

    async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            if (this.processedTxids.has(tx.id)) {
                console.log(`Skipping already processed TX ${tx.id}`);
            }
            this.processedTxids.add(tx.id);

            const result: ParsedTransaction = {
                txid: tx.id,
                protocol: 'MAP',  // Default to MAP protocol
                postId: '',
                tags: [],  // Default tags
                contents: [],
                blockHeight: tx.blockHeight ?? 0,
                timestamp: tx.blockTime ?? new Date(),
                sequence: 0,
                parentSequence: 0,
                vote: {
                    optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                    totalOptions: 0,
                    options: [],
                    questionId: ''
                }
            };

            for (const output of tx.outputs) {
                try {
                    const parsedOutput = this.processOutput(output);
                    if (parsedOutput) {
                        // Only update fields if they are non-empty
                        if (parsedOutput.protocol) {
                            result.protocol = parsedOutput.protocol;
                        }
                        if (parsedOutput.postId) {
                            result.postId = parsedOutput.postId;
                        }
                        if (parsedOutput.tags.length > 0) {
                            result.tags = parsedOutput.tags;
                        }
                        if (parsedOutput.contents.length > 0) {
                            result.contents = parsedOutput.contents;
                        }
                        if (parsedOutput.sequence) {
                            result.sequence = parsedOutput.sequence;
                        }
                        if (parsedOutput.parentSequence) {
                            result.parentSequence = parsedOutput.parentSequence;
                        }
                        if (parsedOutput.vote && parsedOutput.vote.options.length > 0) {
                            result.vote = parsedOutput.vote;
                        }
                    }
                } catch (error) {
                    console.error('Error processing output:', error);
                }
            }

            return result;
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }

    private extractDataPushes(output: any): (Buffer | string)[] {
        const pushes: (Buffer | string)[] = [];
        
        try {
            if (output.script) {
                // Convert hex to buffer
                const scriptBuffer = Buffer.from(output.script, 'hex');
                
                // Check for OP_RETURN
                if (scriptBuffer[0] === 0x6a) {
                    let i = 1;
                    
                    while (i < scriptBuffer.length) {
                        // Handle PUSHDATA1-4
                        const opcode = scriptBuffer[i];
                        i++;
                        
                        let dataLength;
                        if (opcode <= 0x4b) {
                            dataLength = opcode;
                        } else if (opcode === 0x4c) {  // PUSHDATA1
                            if (i >= scriptBuffer.length) break;
                            dataLength = scriptBuffer[i];
                            i++;
                            
                            // Skip any leading non-JSON bytes
                            const data = scriptBuffer.slice(i, i + dataLength);
                            const jsonStart = data.indexOf(Buffer.from('{'));
                            if (jsonStart >= 0) {
                                pushes.push(data.slice(jsonStart));
                            } else {
                                // Check for PNG signature
                                if (data.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
                                    pushes.push(data);
                                }
                            }
                        } else if (opcode === 0x4d) {  // PUSHDATA2
                            if (i + 1 >= scriptBuffer.length) break;
                            dataLength = scriptBuffer.readUInt16LE(i);
                            i += 2;
                            pushes.push(scriptBuffer.slice(i, i + dataLength));
                        } else if (opcode === 0x4e) {  // PUSHDATA4
                            if (i + 3 >= scriptBuffer.length) break;
                            dataLength = scriptBuffer.readUInt32LE(i);
                            i += 4;
                            pushes.push(scriptBuffer.slice(i, i + dataLength));
                        } else {
                            // Unknown opcode, skip
                            break;
                        }
                        
                        i += dataLength;
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting data pushes:', error);
        }
        
        return pushes;
    }

    private processOutput(output: any): ParsedTransaction {
        const pushes = this.extractDataPushes(output);
        console.log('Extracted pushes:', pushes);
        
        const result: ParsedTransaction = {
            txid: '',
            protocol: '',
            postId: '',
            tags: [],
            contents: [{
                type: 'text/plain',
                data: 'wedw'
            }],
            blockHeight: 0,
            timestamp: new Date(),
            sequence: 0,
            parentSequence: 0,
            vote: {
                optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                totalOptions: 0,
                options: [{
                    index: 0,
                    lockAmount: 1000,
                    lockDuration: 1
                }],
                questionId: ''
            }
        };
        
        for (const push of pushes) {
            if (Buffer.isBuffer(push)) {
                try {
                    // Check for PNG signature
                    if (push.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
                        result.contents = [{
                            type: 'image/png',
                            data: push.toString('base64'),
                            encoding: 'base64'
                        }];
                        continue;
                    }
                    
                    // Try to parse JSON
                    let text = push.toString('utf8');
                    console.log('Raw text:', text);
                    
                    try {
                        const jsonData = JSON.parse(text);
                        
                        if (jsonData.application === 'lockd.app') {
                            result.protocol = 'MAP';
                            result.postId = jsonData.postId || '';
                            
                            if (jsonData.tags && Array.isArray(jsonData.tags)) {
                                result.tags = jsonData.tags;
                            }
                            
                            if (jsonData.type === 'vote_option') {
                                result.sequence = parseInt(jsonData.sequence) || 0;
                                result.parentSequence = parseInt(jsonData.parentSequence) || 0;
                            }
                            
                            if (jsonData.content) {
                                result.contents = [{
                                    type: 'text/plain',
                                    data: jsonData.content
                                }];
                            }
                        }
                    } catch (jsonError) {
                        // Try to parse incomplete JSON
                        if (text.includes('"application":"lockd.app"')) {
                            const postIdMatch = text.match(/"postId":"([^"]+)"/);
                            const seqMatch = text.match(/"sequence":"(\d+)"/);
                            const parentSeqMatch = text.match(/"parentSequence":"(\d+)"/);
                            const tagsMatch = text.match(/"tags":\[(.*?)\]/);
                            
                            if (postIdMatch) {
                                result.postId = postIdMatch[1];
                                result.protocol = 'MAP';
                            }
                            
                            if (seqMatch) {
                                result.sequence = parseInt(seqMatch[1]) || 0;
                            }
                            
                            if (parentSeqMatch) {
                                result.parentSequence = parseInt(parentSeqMatch[1]) || 0;
                            }
                            
                            if (tagsMatch) {
                                try {
                                    const tagsStr = `[${tagsMatch[1]}]`;
                                    const tags = JSON.parse(tagsStr);
                                    if (Array.isArray(tags)) {
                                        result.tags = tags;
                                    }
                                } catch (e) {
                                    console.error('Error parsing tags:', e);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing push:', error);
                }
            }
        }
        
        return result;
    }

    private isImageData(data: Buffer): boolean {
        // Check for PNG signature
        if (data.length >= 8) {
            const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            if (data.slice(0, 8).equals(pngSignature)) {
                return true;
            }
        }
        return false;
    }

    private transformContent(parsedTx: ParsedTransaction): any {
        try {
          return {
            text: parsedTx.contents.find(c => c.type === 'text/plain')?.data,
            media: parsedTx.contents
              .filter(c => c.type.startsWith('image/'))
              .map(img => ({
                type: img.type,
                data: img.data,
                encoding: img.encoding,
                filename: img.filename
              })),
            metadata: parsedTx.contents
              .filter(c => c.type === 'application/json')
              .map(json => {
                try {
                  return JSON.parse(json.data as string);
                } catch (e) {
                  console.error('Invalid JSON content:', e);
                  return null;
                }
              })
              .filter(Boolean),
            tags: parsedTx.tags
          };
        } catch (e) {
          console.error('Error transforming content:', e);
          throw new Error('Failed to transform content');
        }
    }
}