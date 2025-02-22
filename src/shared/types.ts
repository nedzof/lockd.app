import { Prisma } from '@prisma/client';

export interface Post {
    id: string;
    postId: string;
    type: string;
    content: any;
    blockTime: Date;
    sequence: number;
    parentSequence: number;
    createdAt: Date;
    updatedAt: Date;
    protocol: string;
    senderAddress?: string | null;
    blockHeight?: number | null;
    txid?: string | null;
    image?: Buffer | null;
    lockLikes?: any[];
    voteOptions?: any[];
    voteQuestion?: any | null;
}

export interface PostWithVoteOptions extends Post {
    voteQuestion: {
        id: string;
        postId: string;
        protocol: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        totalOptions: number;
        optionsHash: string;
    } | null;
    voteOptions: {
        id: string;
        postId: string;
        content: string;
        index: number;
        createdAt: Date;
        updatedAt: Date;
        voteQuestionId: string;
    }[];
}

export interface ParsedTransaction {
    txid: string;
    type: string;
    protocol: string;
    blockHeight?: number;
    blockTime: number | bigint;
    sequence?: number;
    parentSequence?: number;
    senderAddress?: string;
    metadata: {
        postId: string;
        content: string;
        image?: Buffer | null;
        [key: string]: any;
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

export interface TransactionMetadata {
    postId: string;
    content: string;
    lockAmount: number;
    lockDuration: number;
    timestamp: number;
    voteOptions?: string[];
    voteQuestion?: string;
    image?: Buffer;
    imageMetadata?: {
        filename: string;
        contentType: string;
    };
    sequence?: number;
    parentSequence?: number;
    protocol?: string;
    [key: string]: any;
}

export interface DbError extends Error {
    code?: string;
}
