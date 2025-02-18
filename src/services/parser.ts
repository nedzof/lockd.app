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

    private processOutput(output: any, result: ParsedTransaction): void {
        const pushes = this.extractDataPushes(output);
        
        try {
            // Try to parse as JSON first
            for (const push of pushes) {
                try {
                    const json = JSON.parse(push);
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
                        if (json.sequence !== undefined) {
                            result.sequence = Number(json.sequence);
                        }
                        if (json.parentSequence !== undefined) {
                            result.parentSequence = Number(json.parentSequence);
                        }
                        if (json.type === 'vote_question') {
                            result.vote = {
                                optionsHash: json.optionsHash || '',
                                totalOptions: Number(json.totalOptions) || 0,
                                options: [],
                                questionId: json.questionId || ''
                            };
                            if (json.options && Array.isArray(json.options)) {
                                result.vote.options = json.options.map(opt => ({
                                    index: Number(opt.index) || 0,
                                    lockAmount: Number(opt.lockAmount) || 0,
                                    lockDuration: Number(opt.lockDuration) || 0
                                }));
                            }
                        }
                    }
                } catch (e) {
                    // If JSON parsing fails for this push, continue to next
                    continue;
                }
            }
        } catch (e) {
            // If overall processing fails, try processing as regular pushes
            this.processDataPushes(pushes, result);
        }
    }

    private processDataPushes(pushes: string[], result: ParsedTransaction): void {
        // Check for protocol in either JSON or raw format
        let foundProtocol = false;
        for (const p of pushes) {
            try {
                const json = JSON.parse(p);
                if (json.application === 'lockd.app') {
                    foundProtocol = true;
                    result.protocol = 'MAP';
                    if (json.postId) {
                        result.postId = json.postId;
                    }
                    if (json.tags && Array.isArray(json.tags)) {
                        result.tags = json.tags;
                    }
                }
            } catch {
                if (p.includes('lockd.app')) {
                    foundProtocol = true;
                    result.protocol = 'MAP';
                }
            }
        }

        if (!foundProtocol) {
            throw new Error('Invalid protocol version');
        }

        for (const item of pushes) {
            if (item.startsWith('{')) continue; // Skip JSON items, already handled
            
            if (item.startsWith('app=')) {
                result.postId = item.split('=')[1];
            } else if (item.startsWith('text=')) {
                result.contents.push({
                    type: 'text/plain',
                    data: item.split('=')[1]
                });
            } else if (item.startsWith('tag=')) {
                const tag = item.split('=')[1];
                if (tag) {
                    result.tags.push(tag);
                }
            }
        }
    }

    private extractDataPushes(output: any): string[] {
        if (!output || !output.script) return [];

        try {
            // Remove the OP_RETURN prefix (6a) if present
            let script = output.script.startsWith('6a') ? output.script.slice(2) : output.script;
            
            // Handle OP_PUSHDATA (4c) followed by length byte
            if (script.startsWith('4c')) {
                script = script.slice(4);  // Skip 4c and length byte
            }
            
            // Decode the hex string to a buffer
            const buffer = Buffer.from(script, 'hex');
            
            // Convert to string and try to parse
            const str = buffer.toString('utf8');
            
            // Remove any control characters
            const cleanStr = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            
            return [cleanStr];
        } catch (e) {
            console.error('Error extracting data pushes:', e);
            return [];
        }
    }

    private isImageData(data: Buffer): boolean {
        const signatures = {
          'png': [0x89, 0x50, 0x4E, 0x47],
          'jpeg': [0xFF, 0xD8, 0xFF]
        };
        return Object.entries(signatures).some(([type, sig]) => 
          data.subarray(0, sig.length).equals(Buffer.from(sig))
        );
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