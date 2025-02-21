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
    }
}
