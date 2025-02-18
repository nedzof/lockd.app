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
            blockHeight: tx.blockHeight ?? 0 
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
        if (pushes.length === 0) return;

        // Try to parse the first push as JSON
        try {
            const firstPush = pushes[0];
            const json = JSON.parse(firstPush);
            
            if (json.application === 'lockd.app') {
                result.postId = json.postId;
                result.tags = json.tags || [];
                result.sequence = json.sequence || 0;
                result.parentSequence = json.parentSequence || 0;
                
                if (json.type === 'vote_question') {
                    result.vote = {
                        optionsHash: json.optionsHash || '',
                        totalOptions: json.totalOptions || 0,
                        options: [],
                        questionId: json.questionId || ''
                    };
                }
                
                // Handle content
                if (json.content) {
                    result.contents.push({
                        type: 'text/plain',
                        data: json.content
                    });
                }
            }
        } catch (e) {
            // If JSON parsing fails, try processing as regular pushes
            this.processDataPushes(pushes, result);
        }
    }

    private processDataPushes(pushes: string[], result: ParsedTransaction): void {
        // Check for protocol in either JSON or raw format
        const hasProtocol = pushes.some(p => {
            try {
                const json = JSON.parse(p);
                return json.application === 'lockd.app';
            } catch {
                return p.includes('lockd.app');
            }
        });

        if (!hasProtocol) {
            throw new Error('Invalid protocol version');
        }

        for (const item of pushes) {
            if (item.startsWith('{')) continue; // Skip JSON items, already handled in processOutput
            
            if (item.startsWith('app=')) {
                result.postId = item.split('=')[1];
            } else if (item.startsWith('text=')) {
                result.contents.push({
                    type: 'text/plain',
                    data: item.split('=')[1]
                });
            } else if (item.startsWith('tag=')) {
                result.tags.push(item.split('=')[1]);
            } else if (item.startsWith('option=')) {
                result.vote = result.vote || {
                    optionsHash: '',
                    totalOptions: 0,
                    options: [],
                    questionId: ''
                };
                const option = this.parseOption(item);
                if (option) {
                    result.vote.options.push(option);
                }
            }
        }
    }

    private parseOption(item: string): { index: number; lockAmount: number; lockDuration: number } | null {
        try {
            const [_, optionData] = item.split('=');
            const parts = optionData.split(',');
            
            return {
                index: parseInt(parts[0], 10) || 0,
                lockAmount: parseInt(parts[1], 10) || 0,
                lockDuration: parseInt(parts[2], 10) || 0
            };
        } catch (e) {
            console.error('Error parsing option:', e);
            return null;
        }
    }

    private extractDataPushes(output: any): string[] {
        try {
            const script = output.script || '';
            // Convert hex to string if it's a hex string
            if (script.startsWith('6a')) {
                const hex = script.slice(4); // Remove OP_RETURN and length
                return [Buffer.from(hex, 'hex').toString()];
            }
            return [];
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