// src/parser.ts
import { Transaction, ParsedTransactionForProcessing, Output } from './types';

export class TransactionParser {
    private processedTxids = new Set<string>();

    async parseTransaction(tx: Transaction): Promise<ParsedTransactionForProcessing | null> {
        console.log(`Processing TX ${tx.id}`, {
            inputs: tx.inputs.length,
            outputs: tx.outputs.length
        });

        // Skip if already processed
        if (this.processedTxids.has(tx.id)) {
            console.log(`Skipping already processed TX ${tx.id}`);
            return null;
        }
        this.processedTxids.add(tx.id);

        try {
            for (const output of tx.outputs) {
                const parsedOutput = this.parseOutput(output);
                if (parsedOutput) {
                    return {
                        id: tx.id,
                        ...parsedOutput
                    };
                }
            }
        } catch (error) {
            console.error(`Error parsing transaction ${tx.id}:`, error);
        }

        return null;
    }

    private parseOutput(output: Output): Partial<ParsedTransactionForProcessing> | null {
        const script = Buffer.from(output.script, 'hex');
        
        // Check for OP_RETURN
        if (script[0] !== 0x6a) return null;

        const pushes = this.processDataPushes(script);
        if (!pushes.length) return null;

        // Early exit for non-MAP transactions
        if (!pushes.some(p => p.startsWith('app='))) return null;

        const result: Partial<ParsedTransactionForProcessing> = {
            protocol: 'MAP',
            type: 'post'
        };

        for (const push of pushes) {
            if (push.startsWith('app=')) {
                result.postId = push.split('=')[1];
            } else if (push.startsWith('type=')) {
                result.type = push.split('=')[1];
            } else if (push.startsWith('content=')) {
                result.content = push.split('=')[1];
            } else if (push.startsWith('sequence=')) {
                result.sequence = parseInt(push.split('=')[1], 10);
            } else if (push.startsWith('parentSequence=')) {
                result.parentSequence = parseInt(push.split('=')[1], 10);
            } else if (push.startsWith('tags=')) {
                try {
                    result.tags = JSON.parse(push.split('=')[1]);
                } catch (e) {
                    console.error('Error parsing tags:', e);
                }
            } else if (push.startsWith('optionsHash=')) {
                if (!result.vote) result.vote = {};
                result.vote.optionsHash = push.split('=')[1];
            } else if (push.startsWith('lockAmount=')) {
                if (!result.lock) result.lock = { amount: 0, duration: 0 };
                result.lock.amount = parseInt(push.split('=')[1], 10);
            } else if (push.startsWith('lockDuration=')) {
                if (!result.lock) result.lock = { amount: 0, duration: 0 };
                result.lock.duration = parseInt(push.split('=')[1], 10);
            }
        }

        this.validateTransaction(result);
        return result;
    }

    private processDataPushes(script: Buffer): string[] {
        const pushes: string[] = [];
        let offset = 1; // Skip OP_RETURN

        while (offset < script.length) {
            const opcode = script[offset++];
            let length: number;

            // Handle different PUSHDATA opcodes
            if (opcode <= 0x4b) {
                length = opcode;
            } else if (opcode === 0x4c) { // OP_PUSHDATA1
                length = script[offset++];
            } else if (opcode === 0x4d) { // OP_PUSHDATA2
                length = script.readUInt16LE(offset);
                offset += 2;
            } else if (opcode === 0x4e) { // OP_PUSHDATA4
                length = script.readUInt32LE(offset);
                offset += 4;
            } else {
                break;
            }

            const data = script.subarray(offset, offset + length);
            
            // Handle binary data (images) differently
            if (this.isImageData(data)) {
                pushes.push(`content_type=image/png`);
                pushes.push(`data=${data.toString('base64')}`);
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

    private isImageData(data: Buffer): boolean {
        // Simple PNG signature check
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
        return data.length >= 4 && data.subarray(0, 4).equals(pngSignature);
    }

    private validateTransaction(tx: Partial<ParsedTransactionForProcessing>) {
        if (!tx.postId) {
            throw new Error("Invalid transaction: Missing postId");
        }
        if (tx.vote && !tx.vote.optionsHash) {
            throw new Error("Invalid vote: Missing optionsHash");
        }
    }
}