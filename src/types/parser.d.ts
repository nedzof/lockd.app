export interface ParsedTransaction {
    txid: string;
    blockHeight: number;
    blockTime: number;
    decodedTx?: DecodedTransaction;
    metadata: {
        postId: string;
        lockAmount: number;
        lockDuration: number;
        content: string;
        voteOptions: string[];
        voteQuestion: string;
        image: Buffer | null;
        imageMetadata: {
            filename: string;
            contentType: string;
        } | null;
        senderAddress: string | null;
    };
}

export interface DecodedTransaction {
    txid: string;
    inputs: {
        index: number;
        script: string;
        prevTxId: string;
        outputIndex: number;
        sequenceNumber: number;
    }[];
    outputs: {
        index: number;
        script: string;
        satoshis: number;
        opReturn: string | null;
    }[];
}

export interface LockProtocolData {
    postId: string;
    lockAmount: number;
    lockDuration: number;
    content: string;
    voteOptions: string[];
    voteQuestion: string;
    image: Buffer | null;
    imageMetadata: {
        filename: string;
        contentType: string;
    } | null;
}
