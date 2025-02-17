import { OpReturnData, ParsedPost } from './types';
import { JungleBusTransaction } from '../scanner/types';

export interface ProtocolHandler {
  canHandle(protocols: string[]): boolean;
  parseTransaction(
    opReturnData: OpReturnData[], 
    txid?: string, 
    blockHeight?: number, 
    blockTime?: number
  ): Promise<ParsedPost | null>;
}

export const MAP_PROTOCOL_MARKERS = {
  MAP_PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
  APP: 'lockd.app',
  TYPE: 'post'
} as const;
