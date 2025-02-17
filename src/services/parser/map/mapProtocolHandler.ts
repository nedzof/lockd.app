import { BasePost, BaseTransaction, TransactionOutput, VotePost, VotingData } from '../../common/types';
import { ProtocolHandler } from '../protocolHandler';

export class MAPProtocolHandler implements ProtocolHandler {
    canHandle(outputs: TransactionOutput[]): boolean {
        return outputs.some(output => {
            try {
                const scriptBuffer = Buffer.from(output.script, 'hex');
                if (scriptBuffer[0] !== 0x6a) return false; // Not OP_RETURN
                
                const dataBuffer = scriptBuffer.slice(2);
                const scriptString = dataBuffer.toString('utf8');
                return scriptString.includes('app=lockd.app');
            } catch (error) {
                console.error('Error checking MAP protocol:', error);
                return false;
            }
        });
    }

    async parseTransaction(
        transaction: BaseTransaction,
        outputs: TransactionOutput[]
    ): Promise<BasePost | null> {
        try {
            // Find the MAP protocol output
            const mapOutput = outputs.find(output => {
                const scriptBuffer = Buffer.from(output.script, 'hex');
                if (scriptBuffer[0] !== 0x6a) return false;
                
                const dataBuffer = scriptBuffer.slice(2);
                const scriptString = dataBuffer.toString('utf8');
                return scriptString.includes('app=lockd.app');
            });

            if (!mapOutput) return null;

            // Parse the OP_RETURN data
            const scriptBuffer = Buffer.from(mapOutput.script, 'hex');
            const dataBuffer = scriptBuffer.slice(2);
            const scriptString = dataBuffer.toString('utf8');

            // Parse key-value pairs
            const pairs = scriptString.split('&');
            const data: Record<string, string> = {};
            
            for (const pair of pairs) {
                const [key, value] = pair.split('=');
                if (!key || !value) continue;
                data[key] = decodeURIComponent(value);
            }

            // Create base post
            const post: BasePost = {
                id: transaction.id,
                type: data.type || 'post',
                content: data.content || '',
                metadata: {
                    postId: data.postId,
                    protocol: 'MAP',
                    blockHeight: transaction.blockHeight,
                    blockTime: transaction.blockTime,
                    ...data
                }
            };

            // Handle vote questions
            if (data.type === 'vote_question') {
                const votingData: VotingData = {
                    question: data.content || '',
                    options: [],
                    metadata: {
                        totalOptions: parseInt(data.totalOptions || '0', 10),
                        optionsHash: data.optionsHash || '',
                        postId: data.postId || '',
                        protocol: 'MAP',
                        blockHeight: transaction.blockHeight,
                        blockTime: transaction.blockTime
                    }
                };

                return {
                    ...post,
                    votingData
                } as VotePost;
            }

            return post;
        } catch (error) {
            console.error('Error parsing MAP transaction:', error);
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            return null;
        }
    }
}
