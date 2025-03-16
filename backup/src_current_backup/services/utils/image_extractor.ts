/**
 * Image Extractor Utility
 * 
 * Extracts image data from transaction outputs
 */

import logger from '../logger.js';

// Image format signatures for detection
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
 * Checks if a buffer contains a given signature at a specific position
 */
function hasSignatureAt(buffer: Buffer, signature: number[], position: number): boolean {
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
 */
function detectImageFormat(buffer: Buffer, position: number = 0): { format: string; mime_type: string; } | null {
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
 */
function extractImageData(buffer: Buffer): {
  data: Buffer;
  format: string;
  mime_type: string;
  size: number;
  position: number;
} | null {
  if (!buffer || buffer.length < 8) {
    logger.debug(`Buffer too small for image: ${buffer?.length || 0} bytes`);
    return null;
  }

  // Scan the buffer for image signatures
  for (let position = 0; position < buffer.length - 12; position++) {
    const formatInfo = detectImageFormat(buffer, position);
    if (formatInfo) {
      const imageBuffer = buffer.slice(position);
      logger.info(`Image detected: ${formatInfo.format}, size: ${imageBuffer.length} bytes at position ${position}`);
      return {
        data: imageBuffer,
        format: formatInfo.format,
        mime_type: formatInfo.mime_type,
        size: imageBuffer.length,
        position
      };
    }
  }

  logger.debug(`No image signature found in buffer of ${buffer.length} bytes`);
  return null;
}

/**
 * Extract image from a transaction output
 */
export function extractImageFromOutput(output: string): {
  data: Buffer;
  format: string;
  mime_type: string;
  size: number;
  position: number;
  data_url: string;
} | null {
  if (!output) {
    logger.debug('Empty output provided');
    return null;
  }

  try {
    // Try to interpret the output as hex
    logger.debug(`Checking output for image: ${output.substring(0, 30)}... (${output.length} chars)`);
    const buffer = Buffer.from(output, 'hex');
    const imageData = extractImageData(buffer);
    
    if (imageData) {
      // Add data URL for convenience
      const base64Data = imageData.data.toString('base64');
      const dataUrl = `data:${imageData.mime_type};base64,${base64Data}`;
      
      return {
        ...imageData,
        data_url: dataUrl
      };
    }
    
    return null;
  } catch (e) {
    logger.error(`Error extracting image from output: ${e}`);
    return null;
  }
}

/**
 * Extract image from raw transaction data in base64 format
 */
export function extractImageFromRawTx(base64Tx: string): {
  data: Buffer;
  format: string;
  mime_type: string;
  size: number;
  position: number;
  data_url: string;
} | null {
  if (!base64Tx) {
    logger.debug('Empty transaction data provided');
    return null;
  }

  try {
    // Decode base64 transaction data
    logger.debug(`Checking raw transaction data for image: ${base64Tx.substring(0, 30)}... (${base64Tx.length} chars)`);
    const buffer = Buffer.from(base64Tx, 'base64');
    const imageData = extractImageData(buffer);
    
    if (imageData) {
      // Add data URL for convenience
      const base64Data = imageData.data.toString('base64');
      const dataUrl = `data:${imageData.mime_type};base64,${base64Data}`;
      
      logger.info(`Found ${imageData.format} image in raw transaction data, size: ${imageData.size} bytes`);
      
      return {
        ...imageData,
        data_url: dataUrl
      };
    }
    
    return null;
  } catch (e) {
    logger.error(`Error extracting image from raw transaction: ${e}`);
    return null;
  }
}

/**
 * Process multiple transaction outputs to find image data
 */
export function extractImageFromOutputs(outputs: string[]): {
  data: Buffer;
  format: string;
  mime_type: string;
  size: number;
  position: number;
  data_url: string;
} | null {
  if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
    logger.debug('No outputs provided to extractImageFromOutputs');
    return null;
  }

  logger.debug(`Checking ${outputs.length} outputs for images`);
  
  // Check each output for image data
  for (const output of outputs) {
    const imageData = extractImageFromOutput(output);
    if (imageData) {
      return imageData;
    }
  }

  logger.debug('No image found in any output');
  return null;
} 