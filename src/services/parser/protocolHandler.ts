import { BasePost, BaseTransaction, TransactionOutput } from '../common/types';

export interface ProtocolHandler {
  canHandle(outputs: TransactionOutput[]): boolean;
  parseTransaction(
    transaction: BaseTransaction,
    outputs: TransactionOutput[]
  ): Promise<BasePost | null>;
}

export const MAP_PROTOCOL_MARKERS = {
  MAP_PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
  APP: 'lockd.app',
  TYPE: 'post'
} as const;
