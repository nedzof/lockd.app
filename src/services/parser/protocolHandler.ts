import { OpReturnData, ParsedPost, BasePost, BaseTransaction, TransactionOutput } from './types';
import { JungleBusTransaction } from '../scanner/types';

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
