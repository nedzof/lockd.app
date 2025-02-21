declare module 'bsv' {
    export class Script {
        static fromHex(hex: string): Script;
        static Opcode: {
            OP_RETURN: number;
        };
        chunks: {
            opcodenum: number;
            buf?: Buffer;
        }[];
        toHex(): string;
        isDataOut(): boolean;
        getData(): Buffer;
    }

    export class Transaction {
        static fromBuffer(buffer: Buffer): Transaction;
        static fromHex(hex: string): Transaction;
        version: number;
        nLockTime: number;
        inputs: {
            prevTxId: Buffer;
            outputIndex: number;
            sequenceNumber: number;
            script: Script;
        }[];
        outputs: {
            satoshis: number;
            script: Script;
        }[];
    }
}
