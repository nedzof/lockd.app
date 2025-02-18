// src/parser.ts
import { Transaction, ParsedTransaction, Output } from './types';

export class TransactionParser {
    private processedTxids = new Set<string>();

    parseTransaction(tx: Transaction): ParsedTransaction | null {
        if (this.processedTxids.has(tx.id)) {
            console.log(`Skipping already processed TX ${tx.id}`);
            return null;
        }
        this.processedTxids.add(tx.id);

        const result: ParsedTransaction = {
            txid: tx.id,
            blockHeight: tx.blockHeight ?? 0,
            timestamp: tx.blockTime ?? new Date(),
            postId: "",
            sequence: 0,
            parentSequence: 0,
            contents: [],
            tags: []
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

    private processOutput(output: Output, result: ParsedTransaction): void {
        const script = output.script;
        if (!script) return;

        const scriptBuffer = Buffer.from(script, 'hex');
        if (scriptBuffer[0] !== 0x6a) return; // OP_RETURN

        const pushes = this.parseScriptData(scriptBuffer);
        this.processDataPushes(pushes, result);
    }

    private parseScriptData(buffer: Buffer): string[] {
        const pushes: string[] = [];
        let offset = 1; // Skip OP_RETURN

        while (offset < buffer.length) {
            const opcode = buffer[offset];
            let length = 0;
            offset++;

            if (opcode <= 0x4b) {
                length = opcode;
            } else if (opcode === 0x4c) {
                length = buffer[offset];
                offset++;
            } else if (opcode === 0x4d) {
                length = buffer.readUInt16LE(offset);
                offset += 2;
            } else {
                break;
            }

            if (offset + length > buffer.length) break;

            const data = buffer.subarray(offset, offset + length);
            
            // Handle binary data differently
            if (this.isImageData(data)) {
                pushes.push(`content=${data.toString('base64')}`);
                pushes.push(`content-type=image/png`);
            } else {
                try {
                    pushes.push(data.toString('utf8'));
                } catch (e) {
                    console.error('Error decoding push data:', e);
                }
            }

            offset += length;
        }

        return pushes;
    }

    private processDataPushes(pushes: string[], result: ParsedTransaction): void {
        // Validate protocol
        if (!pushes.some(p => p.includes('lockd.app'))) {
            throw new Error('Invalid protocol version');
        }
        
        for (const item of pushes) {
            if (item.startsWith('{')) {
                try {
                    const json = JSON.parse(item);
                    if (json.application === 'lockd.app') {
                        result.postId = json.postId;
                        result.tags = json.tags || [];
                        if (json.optionsHash) {
                            result.vote = result.vote || { optionsHash: '', totalOptions: 0, options: [] };
                            result.vote.optionsHash = json.optionsHash;
                        }
                    }
                } catch (e) {
                    console.error('JSON parse error:', e);
                }
                continue;
            }
            
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
                if (!result.vote) {
                    result.vote = {
                        optionsHash: '',
                        totalOptions: 0,
                        options: []
                    };
                }
                result.vote.options.push(this.parseOption(item));
            }
        }
    }

    private parseOption(item: string): any {
        // TO DO: implement option parsing logic
    }

    private handleType(item: string, result: ParsedTransaction): void {
        const type = item.split('=')[1];
        if (type === 'vote_question') {
            result.sequence = 0;
            if (!result.vote) {
                result.vote = { optionsHash: '', totalOptions: 0, questionId: '', options: [] };
            }
        } else if (type === 'vote_option') {
            result.parentSequence = result.sequence;
        }
    }

    private addContent(item: string, result: ParsedTransaction): void {
        const content = {
            type: 'text/plain',
            data: item.split('=')[1],
            encoding: 'utf8'
        };
        result.contents.push(content);
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