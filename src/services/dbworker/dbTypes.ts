import { BasePost, VotePost } from '../common/types';

export type DBPost = BasePost & {
    createdAt: Date;
    updatedAt: Date;
};

export type DBVotePost = VotePost & {
    createdAt: Date;
    updatedAt: Date;
    options: DBVoteOption[];
};

export type DBVoteOption = {
    id: string;
    index: number;
    content: string;
    lockAmount: number;
    lockDuration: number;
    createdAt: Date;
    updatedAt: Date;
    postId: string;
};
