import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

const TX_ID = 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598';

interface ImageOutput {
    mime_type: string;
    raw_data: string;
    data_url: string;
}

async function fetchTransaction(tx_id: string) {
    const url = `https://junglebus.gorillapool.io/v1/transaction/get/${tx_id}`;
    const response = await axios.get(url);
    return response.data;
}

async function extractImageFromTransaction(tx: any): Promise<ImageOutput | null> {
    try {
        // Find the transaction data that contains the image
        const imageData = tx.transaction;
        if (!imageData) {
            console.log('No transaction data found');
            return null;
        }

        // Get the content type from the data array
        const contentTypeEntry = tx.data.find((item: string) => item.includes('contenttype='));
        const mimeType = contentTypeEntry ? contentTypeEntry.split('=')[1] : 'image/png';

        // Convert the transaction data to a Buffer
        const buffer = Buffer.from(imageData, 'base64');

        // Find the JFIF marker in the buffer (FF D8 FF E0)
        const jfifMarker = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
        let startIndex = -1;
        
        for (let i = 0; i < buffer.length - jfifMarker.length; i++) {
            if (buffer[i] === jfifMarker[0] && 
                buffer[i + 1] === jfifMarker[1] && 
                buffer[i + 2] === jfifMarker[2] && 
                buffer[i + 3] === jfifMarker[3]) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) {
            console.log('No JFIF marker found in transaction data');
            return null;
        }

        // Extract the image data from the buffer
        const imageBuffer = buffer.slice(startIndex);
        const base64Data = imageBuffer.toString('base64');
        
        console.log('Found image data of length:', base64Data.length);

        // Create data URL
        const dataURL = `data:${mimeType};base64,${base64Data}`;

        return {
            mime_type: mimeType,
            raw_data: base64Data,
            data_url: dataURL
        };

    } catch (error) {
        console.error('Error extracting image:', error);
        return null;
    }
}

async function processSpecificTransaction() {
    try {
        console.log(`Processing transaction ${TX_ID}...`);
        const tx = await fetchTransaction(TX_ID);
        console.log('Full transaction data:', JSON.stringify(tx, null, 2));

        // Extract image data if present
        const imageData = await extractImageFromTransaction(tx);
        console.log('Image extraction result:', imageData ? 'Found image data' : 'No image found');

        // Extract relevant data from the transaction
        const data = tx.data || [];
        const parsedData: Record<string, string> = {};
        
        // Parse the data array into key-value pairs
        data.forEach((item: string) => {
            const [key, value] = item.split('=');
            if (key && value) {
                parsedData[key] = value;
            }
        });

        console.log('Parsed data:', parsedData);

        // Extract post data
        const postId = parsedData.postid;
        const content = parsedData.content;
        const timestamp = new Date(parsedData.timestamp);
        const tags = JSON.parse(parsedData.tags || '[]');
        const lockAmount = parseInt(parsedData.lockamount || '0', 10);
        const lockDuration = parseInt(parsedData.lockduration || '0', 10);
        const totalOptions = parseInt(parsedData.totaloptions || '0', 10);

        // Create or update the post in the database
        const post = await prisma.post.upsert({
            where: { tx_id: TX_ID },
            create: {
                tx_id: TX_ID,
                content: content,
                author_address: tx.addresses[0],
                created_at: timestamp,
                tags: tags,
                isVote: totalOptions > 0,
                mediaType: imageData?.mime_type,
                rawImageData: imageData?.raw_data
            },
            update: {
                content: content,
                author_address: tx.addresses[0],
                created_at: timestamp,
                tags: tags,
                isVote: totalOptions > 0,
                mediaType: imageData?.mime_type,
                rawImageData: imageData?.raw_data
            }
        });

        console.log('Post created/updated:', post);

        // If this is a vote post, create vote options
        if (totalOptions > 0) {
            console.log(`Creating ${totalOptions} vote options...`);
            
            for (let i = 0; i < totalOptions; i++) {
                const optionContent = parsedData[`option${i}`] || `Option ${i+1}`;
                const optiontx_id = `${TX_ID}-option-${i}`;
                
                await prisma.vote_option.upsert({
                    where: { tx_id: optiontx_id },
                    create: {
                        tx_id: optiontx_id,
                        content: optionContent,
                        author_address: tx.addresses[0],
                        created_at: timestamp,
                        postId: post.id,
                        optionIndex: i
                    },
                    update: {
                        content: optionContent,
                        author_address: tx.addresses[0],
                        created_at: timestamp,
                        postId: post.id,
                        optionIndex: i
                    }
                });
                
                console.log(`Created vote option ${i+1}: ${optionContent}`);
            }
        }

        console.log('Transaction processed successfully');
    } catch (error) {
        console.error('Error processing transaction:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
processSpecificTransaction().catch(console.error); 