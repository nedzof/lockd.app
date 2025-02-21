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
}

export interface ParsedTransaction {
    txid: string;
    type: string;
    protocol: string;
    blockHeight?: number;
    blockTime?: number | bigint;
    metadata: TransactionMetadata;
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
