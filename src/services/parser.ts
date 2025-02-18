// src/parser.ts
import { Transaction, ParsedTransaction, Output } from './types';

export class TransactionParser {
    private processedTxids = new Set<string>();

    parseTransaction(tx: Transaction): ParsedTransaction | null{
        if (this.processedTxids.has(tx.id)) {
            console.log(`Skipping already processed TX ${tx.id}`);
        }
        this.processedTxids.add(tx.id);

        const result: ParsedTransaction = {
            txid: tx.id,
            postId: '',
            contents: [],
            tags: [],
            timestamp: tx.blockTime ?? new Date(), 
            sequence: 0,
            parentSequence: 0,
            vote: undefined,
            blockHeight: tx.blockHeight ?? 0,
            protocol: ''
        };

        for (const output of tx.outputs) {
            try {
                this.processOutput(output, result);
            } catch (error) {
                console.error('Error processing output:', error);
            }
        }

        return result;
    }

    private extractDataPushes(output: any): (string | Buffer)[] {
        const pushes: (string | Buffer)[] = [];
        try {
            if (!output.script) return pushes;
            
            // Convert hex to buffer
            const scriptBuffer = Buffer.from(output.script, 'hex');
            let i = 0;
            
            while (i < scriptBuffer.length) {
                // Skip OP_RETURN
                if (scriptBuffer[i] === 0x6a) {
                    i++;
                    continue;
                }
                
                // Handle PUSHDATA opcodes
                if (scriptBuffer[i] === 0x4c) {
                    const length = scriptBuffer[i + 1];
                    const data = scriptBuffer.slice(i + 2, i + 2 + length);
                    pushes.push(data);
                    i += 2 + length;
                } else {
                    // Direct push
                    const length = scriptBuffer[i];
                    const data = scriptBuffer.slice(i + 1, i + 1 + length);
                    pushes.push(data);
                    i += 1 + length;
                }
            }
        } catch (e) {
            console.error('Error extracting data pushes:', e);
        }
        return pushes;
    }

    private processOutput(output: any, result: ParsedTransaction): void {
        const pushes = this.extractDataPushes(output);
        
        try {
            for (const push of pushes) {
                if (push instanceof Buffer) {
                    // Try to parse as JSON first
                    try {
                        const jsonStr = push.toString('utf8');
                        const json = JSON.parse(jsonStr);
                        
                        if (json.application === 'lockd.app') {
                            result.protocol = 'MAP';
                            if (json.postId) {
                                result.postId = json.postId;
                            }
                            if (json.tags && Array.isArray(json.tags)) {
                                result.tags = json.tags;
                            }
                            if (json.content) {
                                result.contents.push({
                                    type: 'text/plain',
                                    data: json.content
                                });
                            }
                            
                            // Add default content if none exists
                            if (result.contents.length === 0) {
                                result.contents.push({
                                    type: 'text/plain',
                                    data: 'wedw'
                                });
                            }
                            
                            // Handle sequence fields
                            if (json.sequence !== undefined) {
                                const seq = parseInt(String(json.sequence), 10);
                                result.sequence = isNaN(seq) ? 0 : seq;
                            }
                            if (json.parentSequence !== undefined) {
                                const parentSeq = parseInt(String(json.parentSequence), 10);
                                result.parentSequence = isNaN(parentSeq) ? 0 : parentSeq;
                            }
                            
                            // Handle vote data
                            if (json.type === 'vote_question') {
                                result.vote = {
                                    optionsHash: json.optionsHash || '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                                    totalOptions: parseInt(json.totalOptions, 10) || 0,
                                    options: [],
                                    questionId: json.questionId || ''
                                };
                                if (json.options && Array.isArray(json.options)) {
                                    result.vote.options = json.options.map((opt: { index?: string | number, lockAmount?: string | number, lockDuration?: string | number }) => ({
                                        index: parseInt(String(opt.index), 10) || 0,
                                        lockAmount: parseInt(String(opt.lockAmount), 10) || 1000,
                                        lockDuration: parseInt(String(opt.lockDuration), 10) || 1
                                    }));
                                }
                            } else if (json.type === 'vote_option') {
                                if (!result.vote) {
                                    result.vote = {
                                        optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                                        totalOptions: 0,
                                        options: [],
                                        questionId: ''
                                    };
                                }
                                result.vote.options.push({
                                    index: parseInt(String(json.index), 10) || 0,
                                    lockAmount: parseInt(String(json.lockAmount), 10) || 1000,
                                    lockDuration: parseInt(String(json.lockDuration), 10) || 1
                                });
                            }
                        }
                    } catch (jsonError) {
                        // If JSON parsing fails, check if it's an image
                        if (this.isImageData(push)) {
                            result.contents.push({
                                type: 'image/png',
                                data: push.toString('base64'),
                                encoding: 'base64'
                            });
                        } else {
                            // If not an image, add as text content
                            try {
                                const text = push.toString('utf8');
                                result.contents.push({
                                    type: 'text/plain',
                                    data: text
                                });
                            } catch (e) {
                                console.error('Error converting buffer to text:', e);
                            }
                        }
                    }
                } else if (typeof push === 'string') {
                    result.contents.push({
                        type: 'text/plain',
                        data: push
                    });
                }
            }
            
            // Initialize vote object if it doesn't exist
            if (!result.vote) {
                result.vote = {
                    optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                    totalOptions: 0,
                    options: [{
                        index: 0,
                        lockAmount: 1000,
                        lockDuration: 1
                    }],
                    questionId: ''
                };
            }
        } catch (e) {
            console.error('Error processing output:', e);
        }
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