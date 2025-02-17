import { BasePost, BaseTransaction, TransactionOutput, VotePost, VotingData } from '../../common/types';
import { ProtocolHandler } from '../protocolHandler';
import { MAP_PROTOCOL_MARKERS } from '../protocolHandler';

interface JungleBusTransaction extends BaseTransaction {
    data?: string[];
}

export class MAPProtocolHandler implements ProtocolHandler {
    canHandle(outputs: TransactionOutput[]): boolean {
        // We'll handle this in parseTransaction since we need to check the data field
        return true;
    }

    async parseTransaction(
        transaction: BaseTransaction,
        outputs: TransactionOutput[]
    ): Promise<BasePost | null> {
        if (!transaction?.id) {
            console.error('Invalid transaction: missing transaction ID');
            return null;
        }

        const tx = transaction as JungleBusTransaction;
        if (!tx.data || !Array.isArray(tx.data)) {
            console.error('No data field in transaction');
            return null;
        }

        try {
            // Parse data field into key-value pairs
            const data: Record<string, string> = {};
            for (const item of tx.data) {
                const [key, value] = item.split('=');
                if (key && value) {
                    // If key already exists, prefer the one with vote_question type
                    if (key === 'type' && value === 'vote_question') {
                        data[key] = value;
                    } else if (!data[key]) {
                        data[key] = value;
                    }
                }
            }

            // Check if this is a MAP protocol transaction
            if (data.app !== MAP_PROTOCOL_MARKERS.APP) {
                console.log('Not a MAP protocol transaction');
                return null;
            }

            console.log('Parsed MAP data:', data);

            // Create base post with validated data
            const post: BasePost = {
                id: transaction.id,
                type: 'vote_question',
                content: data.content || '',
                metadata: {
                    protocol: 'MAP',
                    blockHeight: transaction.blockHeight,
                    blockTime: transaction.blockTime,
                    timestamp: transaction.blockTime 
                        ? (transaction.blockTime * 1000).toString() 
                        : Date.now().toString(),
                    sequence: this.validateNumericField(data.sequence, '0'),
                    parentSequence: this.validateNumericField(data.parentsequence, '0')
                }
            };

            // Create vote post with validated data
            const votingData: VotingData = {
                question: data.content || 'Default Question',
                options: this.parseVoteOptions(data),
                totalOptions: parseInt(this.validateNumericField(data.totaloptions, '2'), 10),
                optionsHash: data.optionshash || this.generateOptionsHash(data),
                protocol: 'MAP'
            };

            return {
                ...post,
                votingData
            } as VotePost;

        } catch (error) {
            console.error('Error parsing MAP transaction:', error);
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            return null;
        }
    }

    private validateNumericField(value: string | undefined, defaultValue: string): string {
        if (!value || isNaN(parseInt(value, 10))) {
            return defaultValue;
        }
        return value;
    }

    private parseVoteOptions(data: Record<string, string>): Array<{
        index: number;
        content: string;
        lockAmount: number;
        lockDuration: number;
    }> {
        const options = [];

        // Parse options from the data
        // Find all unique option indices
        const optionIndices = new Set(
            Object.keys(data)
                .filter(key => key.startsWith('optionindex'))
                .map(key => data[key])
                .map(index => parseInt(index, 10))
        );

        // Create options for each index
        for (const index of optionIndices) {
            options.push({
                index,
                content: data[`content${index}`] || `Option ${index + 1}`,
                lockAmount: parseInt(this.validateNumericField(data.lockamount, '1000'), 10),
                lockDuration: parseInt(this.validateNumericField(data.lockduration, '100'), 10)
            });
        }

        // If no options were found in the data, try to parse from content field
        if (options.length === 0 && data.content) {
            options.push({
                index: 0,
                content: data.content,
                lockAmount: parseInt(this.validateNumericField(data.lockamount, '1000'), 10),
                lockDuration: parseInt(this.validateNumericField(data.lockduration, '100'), 10)
            });
        }

        // Ensure we have at least 2 options
        while (options.length < 2) {
            options.push({
                index: options.length,
                content: `Option ${options.length + 1}`,
                lockAmount: 1000,
                lockDuration: 100
            });
        }

        return options;
    }

    private generateOptionsHash(data: Record<string, string>): string {
        // Generate hash from all option-related data
        const optionsData = Object.entries(data)
            .filter(([key]) => key.startsWith('option') || key.startsWith('lockamount') || key.startsWith('lockduration'))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([_, value]) => value)
            .join('|');
        
        return Buffer.from(optionsData || 'default_options').toString('base64');
    }
}
