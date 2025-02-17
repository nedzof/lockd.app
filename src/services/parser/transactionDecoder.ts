import { JungleBusTransaction, TransactionOutput, OpReturnData, VoteOption } from './types';

export class TransactionDecoder {
    decodeTransaction(tx: JungleBusTransaction): OpReturnData[] {
        const decodedOutputs: OpReturnData[] = [];

        if (!tx.outputs) {
            console.log('No outputs found in transaction');
            return decodedOutputs;
        }

        for (const output of tx.outputs) {
            try {
                const decodedOutput = this.decodeOutput(output);
                if (decodedOutput) {
                    decodedOutputs.push(decodedOutput);
                }
            } catch (error) {
                console.error('Error decoding output:', error);
                if (error instanceof Error) {
                    console.error('Error stack:', error.stack);
                }
            }
        }

        return decodedOutputs;
    }

    private decodeOutput(output: TransactionOutput): OpReturnData | undefined {
        try {
            // Decode the script
            const script = output.script;
            if (!script) {
                console.log('No script found in output');
                return undefined;
            }

            // Check if this is an OP_RETURN output
            const scriptBuffer = Buffer.from(script, 'hex');
            if (scriptBuffer[0] !== 0x6a) { // OP_RETURN opcode
                console.log('Not an OP_RETURN output');
                return undefined;
            }

            // Skip OP_RETURN and data length bytes
            const dataBuffer = scriptBuffer.slice(2);
            const scriptString = dataBuffer.toString('utf8');
            console.log('Decoded script:', scriptString);

            // Parse key-value pairs
            const pairs = scriptString.split('&');
            const result: OpReturnData = {
                protocols: [],
                content: '',
                metadata: {}
            };

            for (const pair of pairs) {
                const [key, value] = pair.split('=');
                if (!key || !value) continue;

                const decodedValue = decodeURIComponent(value);

                if (key === 'app' && value === 'lockd.app') {
                    result.protocols.push('MAP');
                    result.protocols.push('ORD');
                } else if (key === 'type') {
                    result.metadata.type = decodedValue;
                } else if (key === 'content') {
                    result.content = decodedValue;
                } else if (key === 'totalOptions') {
                    result.metadata.totalOptions = parseInt(decodedValue, 10);
                } else if (key === 'optionsHash') {
                    result.metadata.optionsHash = decodedValue;
                } else if (key === 'postId') {
                    result.metadata.postId = decodedValue;
                } else if (key === 'optionIndex') {
                    result.metadata.optionIndex = parseInt(decodedValue, 10);
                } else if (key === 'lockAmount') {
                    result.metadata.lockAmount = parseInt(decodedValue, 10);
                } else if (key === 'lockDuration') {
                    result.metadata.lockDuration = parseInt(decodedValue, 10);
                } else {
                    result.metadata[key] = decodedValue;
                }
            }

            // Add protocol for vote questions
            if (result.metadata.type === 'vote_question') {
                result.metadata.protocol = 'MAP';
            }

            return result;
        } catch (error) {
            console.error('Error decoding output:', error);
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            return undefined;
        }
    }
}
