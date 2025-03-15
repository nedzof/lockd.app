/**
 * fetch-image-from-tx.js
 * 
 * A minimal script to fetch and extract images from a bitcoin transaction.
 * This script uses the JungleBus API to retrieve transaction data and extracts
 * both the raw image data and the processed image.
 * 
 * Usage: 
 * node scripts/fetch-image-from-tx.js <txid>
 * 
 * Example:
 * node scripts/fetch-image-from-tx.js a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Image format signatures
const IMAGE_FORMATS = [
  // JPEG signature: FF D8 FF
  {
    format: 'jpeg',
    mime_type: 'image/jpeg',
    signature: [0xFF, 0xD8, 0xFF]
  },
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  {
    format: 'png',
    mime_type: 'image/png',
    signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  },
  // GIF signature: 47 49 46 38 (followed by either 37 or 39) 61
  {
    format: 'gif',
    mime_type: 'image/gif',
    signature: [0x47, 0x49, 0x46, 0x38], // Special case will check 5th and 6th bytes
  },
  // WEBP signature: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  {
    format: 'webp',
    mime_type: 'image/webp',
    signature: [0x52, 0x49, 0x46, 0x46] // Special case will check for WEBP at position + 8
  }
];

/**
 * Fetch transaction data from JungleBus API
 * @param {string} txid Transaction ID to fetch
 * @returns {Promise<Object>} The transaction data
 */
async function fetchTransaction(txid) {
  try {
    console.log(`Fetching transaction ${txid}...`);
    const url = `https://junglebus.gorillapool.io/v1/transaction/get/${txid}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    throw error;
  }
}

/**
 * Checks if a buffer contains a given signature at a specific position
 * @param {Buffer} buffer Buffer to check
 * @param {Array<number>} signature Signature to look for
 * @param {number} position Position to start checking at
 * @returns {boolean} Whether the signature was found
 */
function hasSignatureAt(buffer, signature, position) {
  if (position + signature.length > buffer.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i++) {
    if (buffer[position + i] !== signature[i]) {
      return false;
    }
  }

  // Special case for GIF (checking the 5th and 6th bytes)
  if (signature.length === 4 && 
      signature[0] === 0x47 && signature[1] === 0x49 && 
      signature[2] === 0x46 && signature[3] === 0x38) {
    // Position + 4 should be either 0x37 (7) or 0x39 (9) for GIF87a or GIF89a
    // Position + 5 should be 0x61 (a)
    return (position + 5 < buffer.length) && 
           (buffer[position + 4] === 0x37 || buffer[position + 4] === 0x39) && 
           (buffer[position + 5] === 0x61);
  }

  // Special case for WEBP (checking for WEBP at position + 8)
  if (signature.length === 4 && 
      signature[0] === 0x52 && signature[1] === 0x49 && 
      signature[2] === 0x46 && signature[3] === 0x46) {
    // Check if "WEBP" appears at position + 8
    return (position + 11 < buffer.length) && 
           (buffer[position + 8] === 0x57) && (buffer[position + 9] === 0x45) && 
           (buffer[position + 10] === 0x42) && (buffer[position + 11] === 0x50);
  }

  return true;
}

/**
 * Detect image format in a buffer based on signature
 * @param {Buffer} buffer Buffer to check
 * @param {number} position Position to start checking at
 * @returns {Object|null} Format info or null if not found
 */
function detectImageFormat(buffer, position = 0) {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  for (const format of IMAGE_FORMATS) {
    if (hasSignatureAt(buffer, format.signature, position)) {
      return format;
    }
  }

  return null;
}

/**
 * Extract image data from a buffer
 * @param {Buffer} buffer Buffer to extract from
 * @returns {Object|null} Extracted image or null if not found
 */
function extractImageData(buffer) {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  // Scan the buffer for image signatures
  for (let position = 0; position < buffer.length - 12; position++) {
    const formatInfo = detectImageFormat(buffer, position);
    if (formatInfo) {
      const imageBuffer = buffer.slice(position);
      return {
        data: imageBuffer,
        format: formatInfo.format,
        mime_type: formatInfo.mime_type,
        size: imageBuffer.length,
        position
      };
    }
  }

  return null;
}

/**
 * Extract image from a transaction output
 * @param {string} output Output in hex format
 * @returns {Object|null} Extracted image or null if not found
 */
function extractImageFromOutput(output) {
  if (!output) {
    return null;
  }

  try {
    // Try to interpret the output as hex
    const buffer = Buffer.from(output, 'hex');
    return extractImageData(buffer);
  } catch (e) {
    console.error('Error extracting image from output:', e);
    return null;
  }
}

/**
 * Process transaction outputs to find image data
 * @param {Array<string>} outputs Array of transaction outputs
 * @returns {Object|null} Extracted image or null if not found
 */
function processTransactionOutputs(outputs) {
  if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
    return null;
  }

  // Check each output for image data
  for (const output of outputs) {
    const imageData = extractImageFromOutput(output);
    if (imageData) {
      return imageData;
    }
  }

  return null;
}

/**
 * Creates a data URL from image data for web display
 * @param {Object} imageData Image data
 * @returns {string} Data URL
 */
function createImageDataUrl(imageData) {
  const base64Data = imageData.data.toString('base64');
  return `data:${imageData.mime_type};base64,${base64Data}`;
}

/**
 * Extract image data from a transaction
 * @param {Object} tx Transaction object
 * @returns {Object} Extraction result
 */
function extractImageFromTransaction(tx) {
  try {
    // Check that we have a valid transaction
    if (!tx) {
      console.error('No valid transaction data found');
      return { txid: 'unknown', image: null };
    }

    // First check if we have outputs in the transaction
    if (tx.outputs && Array.isArray(tx.outputs) && tx.outputs.length > 0) {
      console.log(`Processing ${tx.outputs.length} transaction outputs...`);
      const image = processTransactionOutputs(tx.outputs);
      
      if (image) {
        console.log(`Found ${image.format} image in transaction output`);
        return { txid: tx.id, image };
      }
    }

    // If no image found in outputs, check the raw transaction data
    if (tx.transaction && typeof tx.transaction === 'string') {
      console.log('Checking raw transaction data for images...');
      const buffer = Buffer.from(tx.transaction, 'base64');
      const image = extractImageData(buffer);
      
      if (image) {
        console.log(`Found ${image.format} image in raw transaction data`);
        return { txid: tx.id, image };
      }
    }

    console.log('No image data found in transaction');
    return { txid: tx.id, image: null };
  } catch (error) {
    console.error('Error extracting image:', error);
    return { txid: tx.id || 'unknown', image: null };
  }
}

/**
 * Save image to file
 * @param {string} txid Transaction ID
 * @param {Object} image Image data
 * @returns {string} Path to saved file
 */
function saveImageToFile(txid, image) {
  // Create output directory if it doesn't exist
  const outputDir = path.resolve('output', 'images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Determine file extension from mime type
  let extension = 'jpg';
  if (image.mime_type === 'image/png') extension = 'png';
  if (image.mime_type === 'image/gif') extension = 'gif';
  if (image.mime_type === 'image/webp') extension = 'webp';

  // Create file path
  const filePath = path.join(outputDir, `${txid}.${extension}`);
  
  // Write the file
  fs.writeFileSync(filePath, image.data);
  console.log(`Image saved to ${filePath}`);
  
  // Also save the data URL to an HTML file for easy viewing
  const htmlPath = path.join(outputDir, `${txid}.html`);
  const dataUrl = createImageDataUrl(image);
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Transaction Image - ${txid}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    img { max-width: 100%; border: 1px solid #ccc; }
    pre { background: #f5f5f5; padding: 10px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Image from Transaction</h1>
  <p><strong>Transaction ID:</strong> ${txid}</p>
  <p><strong>MIME Type:</strong> ${image.mime_type}</p>
  <p><strong>Image Size:</strong> ${image.data.length} bytes</p>
  <p><strong>Image Format:</strong> ${image.format}</p>
  <p><strong>Found at position:</strong> ${image.position}</p>
  <h2>Image Preview</h2>
  <img src="${dataUrl}" alt="Transaction Image">
</body>
</html>
  `;
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`HTML preview saved to ${htmlPath}`);
  
  return filePath;
}

/**
 * Main function to process a transaction and extract image
 * @param {string} txid Transaction ID to process
 */
async function processTransaction(txid) {
  try {
    // Fetch the transaction
    const tx = await fetchTransaction(txid);
    
    // Extract the image
    const { txid: id, image } = extractImageFromTransaction(tx);
    
    if (image) {
      console.log('Successfully extracted image data:');
      console.log(`- MIME Type: ${image.mime_type}`);
      console.log(`- Format: ${image.format}`);
      console.log(`- Size: ${image.data.length} bytes`);
      
      // Save the image
      const filePath = saveImageToFile(id, image);
      console.log(`\nImage processing complete! Check ${filePath} for the extracted image.`);
      console.log(`Open ${path.join('output', 'images', `${id}.html`)} in a browser to view the image.`);
    } else {
      console.log('No image found in this transaction.');
    }
  } catch (error) {
    console.error('Error processing transaction:', error);
  }
}

// Run the script
const txid = process.argv[2] || 'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053';
console.log(`Starting image extraction for transaction: ${txid}`);
processTransaction(txid).catch(console.error); 