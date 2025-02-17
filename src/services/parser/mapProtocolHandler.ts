import { ProtocolHandler } from './protocolHandler';
import { OpReturnData, ParsedPost } from './types';
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
        console.log('MAPProtocolHandler.parseTransaction:', { 
            opReturnDataLength: opReturnData.length,
            txid,
            blockHeight,
            blockTime
        });

        if (!opReturnData || opReturnData.length === 0) {
            console.log('No opReturnData provided');
            return null;
        }

        // Find the main output (vote question or post)
        const mainOutput = opReturnData.find(output => {
            const isMAP = output.protocols.includes(PROTOCOLS.MAP);
            const isVoteQuestion = output.metadata?.type === 'vote_question';
            console.log('Checking output:', { 
                protocols: output.protocols,
                type: output.metadata?.type,
                isMAP,
                isVoteQuestion
            });
            return isMAP && isVoteQuestion;
        });

        if (!mainOutput) {
            console.log('No main output (vote question) found');
            return null;
        }

        console.log('Found main output:', mainOutput);

        // Initialize parsed post
        const parsedPost: ParsedPost = {
            type: mainOutput.metadata?.type || 'post',
            content: mainOutput.content || '',
            timestamp: blockTime || Math.floor(new Date().getTime() / 1000),
            postId: mainOutput.metadata?.postId || '',
            sequence: 0,
            parentSequence: 0,
            tags: [],
            app: 'lockd.app',
            version: '1.0.0',
            images: [],
            txid: txid || '',
            blockHeight: blockHeight || 0,
            blockTime: blockTime || Math.floor(new Date().getTime() / 1000),
            votingData: mainOutput.metadata?.type === 'vote_question' ? {
                question: mainOutput.content || '',
                options: [],
                metadata: {
                    totalOptions: parseInt(mainOutput.metadata?.totalOptions || '0', 10),
                    optionsHash: mainOutput.metadata?.optionsHash || '',
                    postId: mainOutput.metadata?.postId || ''
                }
            } : undefined
        };

        // If this is a vote post, extract voting data
        if (mainOutput.metadata?.type === 'vote_question') {
            console.log('Processing vote question...');
            
            // Find and parse vote options
            const optionOutputs = opReturnData.filter(output => {
                const isMAP = output.protocols.includes(PROTOCOLS.MAP);
                const isVoteOption = output.metadata?.type === 'vote_option';
                console.log('Checking for vote option:', {
                    protocols: output.protocols,
                    type: output.metadata?.type,
                    isMAP,
                    isVoteOption
                });
                return isMAP && isVoteOption;
            });

            console.log('Found vote options:', optionOutputs.length);

            parsedPost.votingData!.options = optionOutputs
                .map(output => {
                    const option = {
                        index: parseInt(output.metadata?.optionIndex || '0', 10),
                        content: output.content || '',
                        lockAmount: parseInt(output.metadata?.lockAmount || '0', 10),
                        lockDuration: parseInt(output.metadata?.lockDuration || '0', 10)
                    };
                    console.log('Parsed vote option:', option);
                    return option;
                })
                .sort((a, b) => a.index - b.index);

            // Validate total options
            if (parsedPost.votingData!.options.length > 0) {
                parsedPost.votingData!.metadata.totalOptions = parsedPost.votingData!.options.length;
            }

            console.log('Final voting data:', parsedPost.votingData);
        }

        console.log('Final parsed post:', parsedPost);
        return parsedPost;
    }

    private parseTags(tagsString: string): string[] {
        try {
            return JSON.parse(tagsString);
        } catch (e) {
            console.error('Failed to parse tags:', e);
            return [];
        }
    }
}
