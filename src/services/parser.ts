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
        for (const item of pushes) {
            if (item.startsWith('app=')) {
                result.postId = item.split('=')[1];
            } else if (item.startsWith('type=')) {
                this.handleType(item, result);
            } else if (item.startsWith('content=')) {
                this.addContent(item, result);
            } else if (item.startsWith('sequence=')) {
                result.sequence = parseInt(item.split('=')[1], 10);
            } else if (item.startsWith('parentSequence=')) {
                result.parentSequence = parseInt(item.split('=')[1], 10);
            } else if (item.startsWith('lockDuration=')) {
                const duration = parseInt(item.split('=')[1], 10);
                if (result.vote?.options?.length) {
                    result.vote.options[result.vote.options.length - 1].lockDuration = duration;
                }
            } else if (item.startsWith('lockAmount=')) {
                const amount = parseInt(item.split('=')[1], 10);
                if (result.vote?.options?.length) {
                    result.vote.options[result.vote.options.length - 1].lockAmount = amount;
                }
            } else if (item.startsWith('optionsHash=')) {
                if (!result.vote) {
                    result.vote = { optionsHash: '', totalOptions: 0, questionId: '', options: [] };
                }
                result.vote.optionsHash = item.split('=')[1];
            } else if (item.startsWith('content-type=')) {
                const contentType = item.split('=')[1];
                if (result.contents.length > 0) {
                    result.contents[result.contents.length - 1].type = contentType;
                }
            }
        }
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
        // Check for PNG signature
        if (data.length < 8) return false;
        return data[0] === 0x89 && 
               data[1] === 0x50 && 
               data[2] === 0x4E && 
               data[3] === 0x47;
    }
}