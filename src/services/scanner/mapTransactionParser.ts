import { JungleBusTransaction, ParsedPost } from './types';
import { TransactionDecoder } from '../parser/transactionDecoder';
import { MAPProtocolHandler } from '../parser/mapProtocolHandler';
import { OpReturnData } from '../parser/types';

const decoder = new TransactionDecoder();
const mapHandler = new MAPProtocolHandler();

function hexToString(hex: string): string {
    try {
        const bytes = Buffer.from(hex, 'hex');
        return bytes.toString('utf-8');
    } catch (e) {
        console.error('Failed to decode hex:', e);
        return '';
    }
}

export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    console.log('Parsing transaction:', { 
        id: tx.id, 
        blockHeight: tx.block_height,
        outputCount: tx.outputs?.length || 0 
    });

    // 2. Decode all outputs
    const decodedOutputs: OpReturnData[] = (tx.outputs || []).map((output, index) => {
        try {
            // Convert hex to string
            const scriptHex = output.script;
            console.log(`Decoding output ${index}:`, { scriptHex });
            
            const script = hexToString(scriptHex);
            console.log(`Decoded script ${index}:`, { script });
            
            // Parse MAP protocol data
            if (script.includes('OP_RETURN MAP')) {
                console.log(`Found MAP protocol in output ${index}`);
                
                const data = script.split('OP_RETURN MAP ')[1];
                const params = new URLSearchParams(data);

                const decodedOutput = {
                    protocols: ['MAP', 'ORD'],
                    content: params.get('content') || '',
                    metadata: {
                        type: params.get('type') || '',
                        postId: params.get('postId') || '',
                        optionIndex: params.get('optionIndex') || '',
                        lockAmount: params.get('lockAmount') || '',
                        lockDuration: params.get('lockDuration') || '',
                        totalOptions: params.get('totalOptions') || '',
                        optionsHash: params.get('optionsHash') || ''
                    }
                };

                console.log(`Decoded MAP output ${index}:`, decodedOutput);
                return decodedOutput;
            }

            console.log(`No MAP protocol found in output ${index}`);
            return {
                protocols: [],
                content: '',
                metadata: {}
            };
        } catch (e) {
            console.error(`Failed to decode output ${index}:`, e);
            return {
                protocols: [],
                content: '',
                metadata: {}
            };
        }
    });

    // Log decoded outputs for debugging
    console.log('All decoded outputs:', JSON.stringify(decodedOutputs, null, 2));

    // 3. Parse with MAP handler
    console.log('Parsing with MAP handler...');
    const parsedPost = await mapHandler.parseTransaction(decodedOutputs, tx.id, tx.block_height, tx.block_time);
    
    if (!parsedPost) {
        console.log('MAP handler returned null');
        return null;
    }

    console.log('Successfully parsed post:', parsedPost);
    return parsedPost;
}