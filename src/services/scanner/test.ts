import { parseMapTransaction } from './mapTransactionParser';
import { JungleBusTransaction } from './types';

async function main() {
    console.log('Testing transaction parsing...\n');

    // Test 1: Standalone vote option
    const voteOptionTx: JungleBusTransaction = {
        txid: 'vote_option_tx_123',
        blockHash: 'abc123',
        blockHeight: 123456,
        timestamp: '2024-02-15T20:18:32.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_option',
                    content: 'Option A',
                    parentTxid: 'parent_vote_123',
                    lockAmount: 1000,
                    lockDuration: 720,
                    lockPercentage: 25,
                    optionIndex: 0
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('🔍 Test 1: Parsing standalone vote option');
    const parsedVoteOption = await parseMapTransaction(voteOptionTx);
    console.log('Parsed vote option:', parsedVoteOption);

    // Test 2: Post with embedded vote options
    const votePostTx: JungleBusTransaction = {
        txid: 'vote_post_with_options_123',
        blockHash: 'def456',
        blockHeight: 123457,
        timestamp: '2024-02-15T20:18:33.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_question',
                    content: 'Which option do you prefer?',
                    options: [
                        {
                            text: 'Option 1',
                            lockAmount: 1000,
                            lockDuration: 720,
                            lockPercentage: 30,
                            optionIndex: 0
                        },
                        {
                            text: 'Option 2',
                            lockAmount: 2000,
                            lockDuration: 1440,
                            lockPercentage: 70,
                            optionIndex: 1
                        }
                    ]
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 2: Parsing post with embedded vote options');
    const parsedVotePost = await parseMapTransaction(votePostTx);
    console.log('Parsed vote post:', parsedVotePost);

    // Test 3: Regular post (should go to Post table)
    const regularPostTx: JungleBusTransaction = {
        txid: 'regular_post_123',
        blockHash: 'ghi789',
        blockHeight: 123458,
        timestamp: '2024-02-15T20:18:34.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'post',
                    content: 'This is a regular post'
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 3: Parsing regular post');
    const parsedRegularPost = await parseMapTransaction(regularPostTx);
    console.log('Parsed regular post:', parsedRegularPost);
}

main().catch(console.error);
