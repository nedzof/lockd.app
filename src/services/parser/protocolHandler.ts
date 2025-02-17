import { ParsedPost } from './types';
import { JungleBusTransaction } from '../scanner/types';

export interface ProtocolHandler {
  name: string;
  version: string;
  detect: (script: string) => boolean;
  parse: (tx: JungleBusTransaction) => Promise<ParsedPost>;
}

export const MAP_PROTOCOL_MARKERS = {
  MAP_PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
  APP: 'lockd.app',
  TYPE: 'post'
} as const;
