/**
 * View Saved Transactions Script
 * 
 * Displays transactions that have been saved to the database
 */

import prisma from '../db.js';
import logger from '../services/logger.js';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';

type JsonValue = Prisma.JsonValue;
type JsonObject = Prisma.JsonObject;

// Transaction IDs to check
const TRANSACTION_IDS = [
  'c8ebe9050fdb87a546c0477b024d70727e07c9088ad11065fac5fb227b5a72f8', // Vote transaction
  'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053', // Transaction with an image and invalid date
];

/**
 * Save a detected image to a file for viewing
 */
function saveImageToFile(txId: string, dataUrl: string, format: string): string {
  try {
    // Create output directory if it doesn't exist
    const outputDir = path.resolve('output', 'images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create HTML file for viewing the image
    const htmlPath = path.join(outputDir, `${txId}.html`);
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Transaction Image - ${txId}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    img { max-width: 100%; border: 1px solid #ccc; }
    pre { background: #f5f5f5; padding: 10px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Image from Transaction</h1>
  <p><strong>Transaction ID:</strong> ${txId}</p>
  <h2>Image Preview</h2>
  <img src="${dataUrl}" alt="Transaction Image">
</body>
</html>
    `;
    fs.writeFileSync(htmlPath, htmlContent);
    
    console.log(`HTML preview for image saved to ${htmlPath}`);
    return htmlPath;
  } catch (error) {
    console.error(`Error saving image to file: ${error}`);
    return '';
  }
}

/**
 * View transactions saved in the database
 */
async function viewSavedTransactions(): Promise<void> {
  try {
    logger.info('Checking saved transactions in database');
    
    for (const txId of TRANSACTION_IDS) {
      // Get transaction from database
      const transaction = await prisma.processed_transaction.findUnique({
        where: {
          tx_id: txId
        }
      });
      
      if (!transaction) {
        console.log(`\nTransaction ${txId} not found in database`);
        continue;
      }
      
      console.log(`\n=== TRANSACTION ${txId} ===`);
      console.log(`Type: ${transaction.type}`);
      console.log(`Block Height: ${transaction.block_height}`);
      console.log(`Block Time: ${new Date(Number(transaction.block_time) * 1000).toISOString()}`);
      console.log(`Protocol: ${transaction.protocol}`);
      console.log(`Created: ${transaction.created_at}`);
      console.log(`Updated: ${transaction.updated_at}`);
      
      // Check for image data
      if (transaction.metadata && 
          typeof transaction.metadata === 'object' && 
          transaction.metadata !== null &&
          'image_metadata' in transaction.metadata) {
        
        const metadata = transaction.metadata as JsonObject;
        const imageMetadata = metadata.image_metadata as JsonObject;
        
        if (imageMetadata) {
          console.log('\nIMAGE DATA FOUND:');
          console.log(`Format: ${String(imageMetadata.format || 'unknown')}`);
          console.log(`MIME Type: ${String(imageMetadata.mime_type || 'unknown')}`);
          console.log(`Size: ${Number(imageMetadata.size || 0)} bytes`);
          
          // Save image to file if data URL exists
          if ('image_data_url' in metadata && metadata.image_data_url) {
            const htmlPath = saveImageToFile(
              txId, 
              String(metadata.image_data_url), 
              String(imageMetadata.format || 'jpg')
            );
            console.log(`Open ${htmlPath} in a browser to view the image`);
          }
        }
      }
      
      console.log('\nMETADATA:');
      // Clone metadata and remove raw image data to avoid large console output
      if (transaction.metadata && typeof transaction.metadata === 'object' && transaction.metadata !== null) {
        const metadataObj = transaction.metadata as JsonObject;
        const metadataForDisplay: Record<string, any> = { ...metadataObj };
        
        if (metadataForDisplay.raw_image_data && typeof metadataForDisplay.raw_image_data === 'string') {
          const data = metadataForDisplay.raw_image_data as string;
          metadataForDisplay.raw_image_data = `[Base64 data: ${
            data.substring(0, 30)
          }... (${data.length} chars)]`;
        }
        
        if (metadataForDisplay.image_data_url && typeof metadataForDisplay.image_data_url === 'string') {
          const url = metadataForDisplay.image_data_url as string;
          metadataForDisplay.image_data_url = `[Data URL: ${
            url.substring(0, 30)
          }... (${url.length} chars)]`;
        }
        
        console.log(JSON.stringify(metadataForDisplay, null, 2));
      } else {
        console.log(JSON.stringify(transaction.metadata, null, 2));
      }
    }
    
    // Count total transactions in database
    const totalCount = await prisma.processed_transaction.count();
    console.log(`\nTotal transactions in database: ${totalCount}`);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`Error viewing transactions: ${(error as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the script
viewSavedTransactions().catch(async (error) => {
  logger.error(`Unhandled error: ${error.message}`);
  await prisma.$disconnect();
  process.exit(1);
}); 