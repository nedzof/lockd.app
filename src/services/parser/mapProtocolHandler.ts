import { JungleBusTransaction, OpReturnData, ParsedPost, ProtocolHandler } from './types';
import { PROTOCOLS } from './constants';

export class MAPProtocolHandler implements ProtocolHandler {
    canHandle(protocols: string[]): boolean {
        const canHandle = protocols.includes(PROTOCOLS.MAP) || protocols.includes(PROTOCOLS.ORD);
        console.log('MAPProtocolHandler.canHandle:', { protocols, canHandle });
        return canHandle;
    }

    async parseTransaction(
        opReturnData: OpReturnData[],
        txid?: string,
        blockHeight?: number,
        blockTime?: number
    ): Promise<ParsedPost | null> {
        if (!opReturnData || opReturnData.length === 0) {
            return null;
        }

        // Find the MAP protocol data
        const mapData = opReturnData.find(data => data.protocols.includes('MAP'));
        if (!mapData) {
            return null;
        }

        // Extract post data
        const post: ParsedPost = {
            id: txid || '',
            type: mapData.metadata.type || 'post',
            content: mapData.content || '',
            metadata: {
                ...mapData.metadata,
                blockHeight: blockHeight || 0,
                blockTime: blockTime || 0,
                protocol: 'MAP'
            }
        };

        return post;
    }
}
