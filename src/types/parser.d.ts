export interface ParsedTransaction {
    tx_id: string;
    blockHeight: number;
    blockTime: number;
    decodedTx?: DecodedTransaction;
    metadata: {
        postId: string;
        lockAmount: number;
        lockDuration: number;
        content: string;
        vote_options: string[];
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
    tx_id: string;
    inputs: {
        index: number;
        script: string;
        prevtx_id: string;
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
    vote_options: string[];
    voteQuestion: string;
    image: Buffer | null;
    imageMetadata: {
        filename: string;
        contentType: string;
    } | null;
}
