import { JungleBusClient } from '@gorillapool/js-junglebus';
import { DbClient } from '../dbClient.js';
import { TransactionParser } from '../parser.js';
import { ParsedTransaction } from '../types.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { Post, VoteOption, VoteQuestion, LockLike, Prisma } from '@prisma/client';

// Import test transactions
interface TestTxData {
    transactions: string[];
}

const testTxData: TestTxData = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_tx.json'), 'utf-8'));

interface JungleBusResponse {
    id: string;
    transaction: string;
    block_hash?: string;
    block_height?: number;
    block_time?: number;
    outputs: string[];
    data: string[];
    addresses?: string[];
}

interface TransactionTestCase {
    txid: string;
    description?: string;
    expectedPostId?: string;
    expectedSenderAddress?: string;
    hasImage?: boolean;
    defaultLockAmount?: number;
    defaultLockDuration?: number;
    expectedImageMetadata?: {
        contentType: string;
        filename: string;
    };
}

interface VerificationResults {
    hasPost: boolean;
    hasVoteQuestion: boolean;
    voteOptionsCount: number;
    hasLockLikes: boolean;
    txid: string;
    postId: string;
    voteQuestion?: {
        question: string;
        totalOptions: number;
        optionsHash: string;
    };
    voteOptions?: Array<{
        index: number;
        content: string;
    }>;
}

interface ProcessedTxMetadata {
    postId: string;
    content: string;
    image?: Buffer | null;
    imageMetadata?: {
        contentType: string;
        filename: string;
        width?: number;
        height?: number;
        size?: number;
        encoding: string;
    };
    rawTx: JungleBusResponse;
    [key: string]: any;
}

// Add new helper function to extract text content
function extractTextContent(tx: JungleBusResponse): string[] {
    const contents: string[] = [];
    tx.data.forEach(item => {
        if (item.startsWith('content=')) {
            const content = item.split('=')[1];
            if (content) {
                contents.push(content);
            }
        }
    });
    return contents;
}

// Add new helper function to extract vote data
function extractVoteData(tx: JungleBusResponse): { 
    question?: string, 
    options?: { text: string, lockAmount: number, lockDuration: number, optionIndex: number }[],
    totalOptions?: number,
    optionsHash?: string 
} {
    const voteData: { 
        question?: string, 
        options?: { text: string, lockAmount: number, lockDuration: number, optionIndex: number }[],
        totalOptions?: number,
        optionsHash?: string 
    } = {};
    
    // Check if this is a vote transaction
    const isVoteQuestion = tx.data.some(d => d.startsWith('type=vote_question'));
    const isVoteOption = tx.data.some(d => d.startsWith('type=vote_option'));
    
    if (isVoteQuestion || isVoteOption) {
        // Extract vote question
        const questionContent = tx.data.find(d => d.startsWith('content='))?.split('=')[1];
        if (questionContent) {
            voteData.question = questionContent;
        }

        // Extract total options and hash
        const totalOptionsStr = tx.data.find(d => d.startsWith('totaloptions='))?.split('=')[1];
        if (totalOptionsStr) {
            voteData.totalOptions = parseInt(totalOptionsStr);
        }

        const optionsHash = tx.data.find(d => d.startsWith('optionshash='))?.split('=')[1];
        if (optionsHash) {
            voteData.optionsHash = optionsHash;
        }

        // Extract vote options
        const optionIndices = tx.data.filter(d => d.startsWith('optionindex=')).map(d => parseInt(d.split('=')[1]));
        if (optionIndices.length > 0) {
            // Get all content items
            const contents = tx.data
                .filter(d => d.startsWith('content='))
                .map(d => d.split('=')[1]);

            voteData.options = optionIndices.map(index => ({
                text: contents[index + 1] || contents[0] || '', // index + 1 because first content is the question
                lockAmount: parseInt(tx.data.find(d => d.startsWith('lockamount='))?.split('=')[1] || '0'),
                lockDuration: parseInt(tx.data.find(d => d.startsWith('lockduration='))?.split('=')[1] || '0'),
                optionIndex: index
            }));
        }
    }
    
    return voteData;
}

// Add new helper function to verify database contents
async function verifyDatabaseContents(txid: string, dbClient: DbClient, testOutputDir: string) {
    // Get the processed transaction
    const processedTx = await dbClient.getTransaction(txid);
    if (!processedTx) {
        throw new Error(`No processed transaction found for txid ${txid}`);
    }

    const metadata = processedTx.metadata as ProcessedTxMetadata;

    // Get the post with vote data
    const post = await dbClient.getPostWithVoteOptions(metadata.postId);
    if (!post) {
        throw new Error(`No post found for postId ${metadata.postId}`);
    }

    // Prepare verification results
    const results = {
        hasPost: true,
        hasImage: !!post.image,
        hasVoteQuestion: post.voteQuestion !== null,
        voteOptionsCount: post.voteOptions?.length || 0,
        hasLockLikes: post.lockLikes?.length > 0 || false,
        txid,
        postId: post.postId,
        contentType: post.image ? 'Image + Text' : 'Text Only',
        voteQuestion: post.voteQuestion ? {
            question: post.voteQuestion.question,
            totalOptions: post.voteQuestion.totalOptions,
            optionsHash: post.voteQuestion.optionsHash
        } : undefined,
        voteOptions: post.voteOptions?.map(opt => ({
            content: opt.content,
            index: opt.index
        })).sort((a, b) => a.index - b.index)
    };

    // Log verification results
    logger.info('Database verification results', results);

    // Save image if present
    if (post.image) {
        const ext = (metadata.imageMetadata?.contentType?.split('/')[1] || 'jpg');
        const imagePath = path.join(testOutputDir, `${txid}_image.${ext}`);
        await fs.promises.writeFile(imagePath, post.image);
        logger.info('Saved image to file', { path: imagePath });
    }

    // Write verification results to file
    const outputPath = path.join(testOutputDir, `${txid}_verification.txt`);
    const outputContent = [
        `Transaction ID: ${txid}`,
        `Post ID: ${post.postId}`,
        `Content Type: ${results.contentType}`,
        `Block Time: ${post.blockTime.toISOString()}`,
        `Sender Address: ${post.senderAddress || 'Not specified'}`,
        '\nContent:',
        post.content,
        '\nTransaction Details:',
        `- Has Image: ${results.hasImage}`,
        `- Has Vote Question: ${results.hasVoteQuestion}`,
        `- Vote Options Count: ${results.voteOptionsCount}`,
        `- Has Lock Likes: ${results.hasLockLikes}`,
        results.hasImage ? [
            '\nImage Metadata:',
            `- Content Type: ${metadata.imageMetadata?.contentType || 'Not specified'}`,
            `- Filename: ${metadata.imageMetadata?.filename || 'Not specified'}`,
            `- Size: ${metadata.imageMetadata?.size || 'Not specified'}`,
            `- Dimensions: ${metadata.imageMetadata?.width || '?'}x${metadata.imageMetadata?.height || '?'}`
        ].join('\n') : '',
        results.hasVoteQuestion ? [
            '\nVote Details:',
            `Question: ${post.voteQuestion?.question}`,
            `Total Options: ${post.voteQuestion?.totalOptions}`,
            `Options Hash: ${post.voteQuestion?.optionsHash}`,
            '\nVote Options:',
            ...post.voteOptions
                .sort((a, b) => a.index - b.index)
                .map((opt, i) => `${i + 1}. ${opt.content} (Index: ${opt.index})`)
        ].join('\n') : '\nNo Vote Data'
    ].join('\n');

    await fs.promises.writeFile(outputPath, outputContent);
    logger.info('Saved verification results to', { path: outputPath });

    return results;
}

describe('TransactionParser Integration Tests', () => {
    let dbClient: DbClient;
    let jungleBus: JungleBusClient;
    let parser: TransactionParser;
    let testOutputDir: string;

    beforeAll(async () => {
        // Set logger to debug for tests to see what's happening
        logger.level = 'debug';
        
        dbClient = new DbClient();
        await dbClient.connect();
        jungleBus = new JungleBusClient('https://junglebus.gorillapool.io');
        parser = new TransactionParser(dbClient);

        // Create test_output directory if it doesn't exist
        testOutputDir = path.join(process.cwd(), 'test_output');
        fs.mkdirSync(testOutputDir, { recursive: true });

        // Create a summary file for all transactions
        const summaryPath = path.join(testOutputDir, '_summary.txt');
        fs.writeFileSync(summaryPath, `Transaction Analysis Summary
Generated at: ${new Date().toISOString()}
Total Transactions: ${testTxData.transactions.length}
===========================================\n\n`);
    });

    afterAll(async () => {
        await dbClient.disconnect();

        // Update summary with final statistics
        const summaryPath = path.join(testOutputDir, '_summary.txt');
        const stats = {
            totalTx: testTxData.transactions.length,
            withImages: 0,
            withVotes: 0,
            withContent: 0
        };

        // Collect statistics from individual files
        testTxData.transactions.forEach((txid: string) => {
            const contentPath = path.join(testOutputDir, `${txid}_content.txt`);
            if (fs.existsSync(contentPath)) {
                const content = fs.readFileSync(contentPath, 'utf-8');
                if (content.includes('Content Items:')) stats.withContent++;
                if (content.includes('Vote Question:')) stats.withVotes++;
            }
            if (fs.existsSync(path.join(testOutputDir, `${txid}_image.jpeg`))) {
                stats.withImages++;
            }
        });

        // Append statistics to summary
        fs.appendFileSync(summaryPath, `Final Statistics:
- Total Transactions Processed: ${stats.totalTx}
- Transactions with Images: ${stats.withImages}
- Transactions with Votes: ${stats.withVotes}
- Transactions with Content: ${stats.withContent}
`);
    });

    beforeEach(async () => {
        await dbClient.cleanupTestData();
    });

    // Generate test cases from test_tx.json
    const testCases: TransactionTestCase[] = testTxData.transactions.map((txid: string) => ({
        txid,
        description: `Transaction ${txid}`,
        defaultLockAmount: 1000,
        defaultLockDuration: 30
    }));

    testCases.forEach(testCase => {
        it(`should successfully parse and store ${testCase.description}`, async () => {
            // Fetch transaction from JungleBus
            const response = await jungleBus.GetTransaction(testCase.txid);
            const tx = response as unknown as JungleBusResponse;
            
            // Debug log the transaction data
            logger.debug('Raw transaction data', {
                addresses: tx.addresses,
                block_height: tx.block_height,
                block_time: tx.block_time,
                data: tx.data,
                id: tx.id,
                outputCount: tx.outputs?.length
            });

            if (!tx || !tx.outputs) {
                throw new Error('Failed to fetch transaction');
            }

            // Add required LOCK protocol data if not present
            if (!tx.data) {
                tx.data = [];
            }

            // Ensure required LOCK protocol fields are present
            const hasLockApp = tx.data.some(d => d === 'app=lockd.app');
            if (!hasLockApp) {
                tx.data.unshift('app=lockd.app');
            }

            // Add required fields if missing
            const requiredFields = {
                postid: tx.data.find(d => d.startsWith('postid='))?.split('=')[1] || testCase.expectedPostId,
                lockamount: tx.data.find(d => d.startsWith('lockamount='))?.split('=')[1] || testCase.defaultLockAmount?.toString(),
                lockduration: tx.data.find(d => d.startsWith('lockduration='))?.split('=')[1] || testCase.defaultLockDuration?.toString(),
                content: tx.data.find(d => d.startsWith('content='))?.split('=')[1] || 'Test post content'
            };

            // Add image metadata if this is an image transaction
            if (testCase.hasImage && testCase.expectedImageMetadata) {
                const imageFields = {
                    contenttype: testCase.expectedImageMetadata.contentType,
                    imagefilename: testCase.expectedImageMetadata.filename
                };
                
                for (const [key, value] of Object.entries(imageFields)) {
                    if (!tx.data.some(d => d.startsWith(`${key}=`)) && value) {
                        tx.data.push(`${key}=${value}`);
                    }
                }
            }

            for (const [key, value] of Object.entries(requiredFields)) {
                if (!tx.data.some(d => d.startsWith(`${key}=`)) && value) {
                    tx.data.push(`${key}=${value}`);
                }
            }

            // Extract and save text content and vote data
            const textContents = extractTextContent(tx);
            const voteData = extractVoteData(tx);
            
            const textOutputPath = path.join(testOutputDir, `${testCase.txid}_content.txt`);
            const textOutput = `Transaction ID: ${testCase.txid}
Description: ${testCase.description}
Timestamp: ${new Date().toISOString()}

Content Items:
${textContents.map((content, index) => `${index + 1}. ${content}`).join('\n')}

${voteData.question ? `Vote Question: ${voteData.question}
Total Options: ${voteData.totalOptions || 'N/A'}
Options Hash: ${voteData.optionsHash || 'N/A'}` : ''}
${voteData.options ? `\nVote Options:
${voteData.options.map((opt, index) => 
    `${index + 1}. Text: ${opt.text}
   Lock Amount: ${opt.lockAmount}
   Lock Duration: ${opt.lockDuration}
   Option Index: ${opt.optionIndex}`
).join('\n')}` : ''}
`;
            fs.writeFileSync(textOutputPath, textOutput);
            logger.info('Saved text content to', { path: textOutputPath });

            // Parse transaction
            const parsedTx = await parser.parseTransaction(tx);
            if (!parsedTx) {
                logger.error('Failed to parse transaction. Transaction data:', tx.data);
                throw new Error('Failed to parse transaction');
            }

            // Save transaction
            const savedTx = await dbClient.saveTransaction({
                ...parsedTx,
                txid: tx.id,
                blockHeight: tx.block_height || 0,
                blockTime: tx.block_time ? Number(tx.block_time) : 0,
                senderAddress: tx.addresses?.[0]
            });

            // Verify saved transaction
            expect(savedTx).toBeDefined();
            expect(savedTx.post).toBeDefined();
            if (testCase.expectedPostId) {
                expect(savedTx.post.id).toBe(testCase.expectedPostId);
            }
            if (testCase.expectedSenderAddress) {
                expect(savedTx.post.senderAddress).toBe(testCase.expectedSenderAddress);
            }

            // Verify the transaction was saved by fetching it
            const fetchedTx = await dbClient.getTransaction(tx.id);
            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.metadata.content).toBe(parsedTx.metadata.content);
            expect(fetchedTx?.metadata.postId).toBe(parsedTx.metadata.postId);
            expect(fetchedTx?.metadata.lockAmount).toBe(parsedTx.metadata.lockAmount);
            expect(fetchedTx?.metadata.lockDuration).toBe(parsedTx.metadata.lockDuration);

            // If this was an image transaction, verify the image data
            if (testCase.hasImage) {
                expect(fetchedTx?.metadata.image).toBeDefined();
                expect(fetchedTx?.metadata.imageMetadata?.contentType).toMatch(/^image\//);
            }

            // Add verification step after saving transaction
            await verifyDatabaseContents(tx.id, dbClient, testOutputDir);

            logger.info('Transaction test completed successfully', {
                txid: testCase.txid,
                postId: parsedTx.metadata.postId,
                hasImage: testCase.hasImage
            });
        }, 30000);
    });
});
