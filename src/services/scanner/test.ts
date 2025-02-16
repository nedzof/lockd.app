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

    // Test 2: Post with embedded vote options (JSON array)
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
                            description: 'First choice with description',
                            lockAmount: 1000,
                            lockDuration: 720,
                            lockPercentage: 30,
                            optionIndex: 0
                        },
                        {
                            text: 'Option 2',
                            description: 'Second choice with description',
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

    console.log('\n🔍 Test 2: Parsing post with embedded vote options (JSON array)');
    const parsedVotePost = await parseMapTransaction(votePostTx);
    console.log('Parsed vote post:', parsedVotePost);

    // Test 3: Post with comma-separated options
    const commaSeparatedTx: JungleBusTransaction = {
        txid: 'vote_post_comma_sep_123',
        blockHash: 'ghi789',
        blockHeight: 123458,
        timestamp: '2024-02-15T20:18:34.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_question',
                    content: 'Choose a day:',
                    options: 'heute, morgen, übermorgen'
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 3: Parsing post with comma-separated options');
    const parsedCommaSep = await parseMapTransaction(commaSeparatedTx);
    console.log('Parsed comma-separated options:', parsedCommaSep);

    // Test 4: Post with whitespace-separated options
    const whitespaceSepTx: JungleBusTransaction = {
        txid: 'vote_post_whitespace_sep_123',
        blockHash: 'jkl012',
        blockHeight: 123459,
        timestamp: '2024-02-15T20:18:35.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_question',
                    content: 'Choose a color:',
                    options: 'red blue green'
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 4: Parsing post with whitespace-separated options');
    const parsedWhitespaceSep = await parseMapTransaction(whitespaceSepTx);
    console.log('Parsed whitespace-separated options:', parsedWhitespaceSep);

    // Test 5: Post with mixed format options
    const mixedFormatTx: JungleBusTransaction = {
        txid: 'vote_post_mixed_format_123',
        blockHash: 'mno345',
        blockHeight: 123460,
        timestamp: '2024-02-15T20:18:36.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_question',
                    content: 'Mixed format test:',
                    options: [
                        { text: 'Option 1', lockAmount: '1000' },
                        'Simple Option 2',
                        { label: 'Option 3', description: 'Using label instead of text' },
                        { content: 'Option 4', lockPercentage: '50' }
                    ]
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 5: Parsing post with mixed format options');
    const parsedMixedFormat = await parseMapTransaction(mixedFormatTx);
    console.log('Parsed mixed format options:', parsedMixedFormat);

    // Test 6: Edge cases
    const edgeCasesTx: JungleBusTransaction = {
        txid: 'vote_post_edge_cases_123',
        blockHash: 'pqr678',
        blockHeight: 123461,
        timestamp: '2024-02-15T20:18:37.000Z',
        addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
        inputs: [],
        outputs: [
            {
                outputScript: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
                    app: 'lockd.app',
                    type: 'vote_question',
                    content: 'Edge cases test:',
                    options: [
                        '',  // Empty option
                        { },  // Empty object
                        { text: '' },  // Empty text
                        { text: '  ' },  // Whitespace text
                        { text: 'Valid Option' },  // Valid option
                        null,  // Null option
                        { text: 'Invalid Numbers', lockAmount: 'abc', lockDuration: -1 }  // Invalid numbers
                    ]
                })).toString('hex'), 'hex'),
                value: 0
            }
        ]
    };

    console.log('\n🔍 Test 6: Parsing post with edge cases');
    const parsedEdgeCases = await parseMapTransaction(edgeCasesTx);
    console.log('Parsed edge cases:', parsedEdgeCases);
}

main().catch(console.error);
