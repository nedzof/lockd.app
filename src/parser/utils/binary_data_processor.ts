/**
 * Binary Data Processor
 * 
 * Processes binary data in transactions, detects binary content,
 * extracts image signatures, and identifies content types.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { createLogger, format, transports, Logger } from 'winston';

// Common image signatures (magic numbers)
const IMAGE_SIGNATURES = {
  JPEG: [0xFF, 0xD8, 0xFF],
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  GIF87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  GIF89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  WEBP: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  BMP: [0x42, 0x4D]
};

// Common MIME types
export enum ContentType {
  JPEG = 'image/jpeg',
  PNG = 'image/png',
  GIF = 'image/gif',
  WEBP = 'image/webp',
  BMP = 'image/bmp',
  SVG = 'image/svg+xml',
  TEXT = 'text/plain',
  HTML = 'text/html',
  JSON = 'application/json',
  XML = 'application/xml',
  BINARY = 'application/octet-stream',
  UNKNOWN = 'unknown'
}

export class BinaryDataProcessor {
  private logger: Logger;
  
  constructor() {
    // Initialize logger
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
  }
  
  /**
   * Detect content type from buffer data
   * @param buffer The buffer to analyze
   * @returns The detected content type
   */
  detect_content_type(buffer: Buffer): ContentType {
    if (!buffer || buffer.length === 0) {
      return ContentType.UNKNOWN;
    }
    
    // Check for image signatures
    if (this.match_signature(buffer, IMAGE_SIGNATURES.JPEG)) {
      return ContentType.JPEG;
    }
    
    if (this.match_signature(buffer, IMAGE_SIGNATURES.PNG)) {
      return ContentType.PNG;
    }
    
    if (this.match_signature(buffer, IMAGE_SIGNATURES.GIF87a) || 
        this.match_signature(buffer, IMAGE_SIGNATURES.GIF89a)) {
      return ContentType.GIF;
    }
    
    if (this.match_signature(buffer, IMAGE_SIGNATURES.WEBP)) {
      return ContentType.WEBP;
    }
    
    if (this.match_signature(buffer, IMAGE_SIGNATURES.BMP)) {
      return ContentType.BMP;
    }
    
    // Check for text-based content
    if (this.is_text_content(buffer)) {
      // Check for specific text formats
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
      
      if (this.is_html_content(text)) {
        return ContentType.HTML;
      }
      
      if (this.is_svg_content(text)) {
        return ContentType.SVG;
      }
      
      if (this.is_json_content(text)) {
        return ContentType.JSON;
      }
      
      if (this.is_xml_content(text)) {
        return ContentType.XML;
      }
      
      return ContentType.TEXT;
    }
    
    // Default to binary
    return ContentType.BINARY;
  }
  
  /**
   * Check if buffer matches a signature
   * @param buffer The buffer to check
   * @param signature The signature to match
   * @returns True if the buffer matches the signature
   */
  private match_signature(buffer: Buffer, signature: (number | null)[]): boolean {
    if (buffer.length < signature.length) {
      return false;
    }
    
    for (let i = 0; i < signature.length; i++) {
      // Skip null values in signature (wildcards)
      if (signature[i] === null) {
        continue;
      }
      
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if buffer contains text content
   * @param buffer The buffer to check
   * @returns True if the buffer likely contains text
   */
  private is_text_content(buffer: Buffer): boolean {
    // Simple heuristic: check if the buffer contains mostly printable ASCII characters
    // and no null bytes in the first 1000 bytes
    const sampleSize = Math.min(buffer.length, 1000);
    let printableCount = 0;
    
    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      
      // Null byte indicates binary content
      if (byte === 0) {
        return false;
      }
      
      // Count printable ASCII characters and common whitespace
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        printableCount++;
      }
    }
    
    // If more than 90% of the sample is printable, consider it text
    return printableCount / sampleSize > 0.9;
  }
  
  /**
   * Check if text content is HTML
   * @param text The text to check
   * @returns True if the text appears to be HTML
   */
  private is_html_content(text: string): boolean {
    const htmlPattern = /<(!DOCTYPE|html|head|body|div|span|h[1-6]|p|a|img|table|form|script|link|meta)/i;
    return htmlPattern.test(text);
  }
  
  /**
   * Check if text content is SVG
   * @param text The text to check
   * @returns True if the text appears to be SVG
   */
  private is_svg_content(text: string): boolean {
    const svgPattern = /<svg[^>]*>/i;
    return svgPattern.test(text);
  }
  
  /**
   * Check if text content is JSON
   * @param text The text to check
   * @returns True if the text appears to be JSON
   */
  private is_json_content(text: string): boolean {
    try {
      const trimmed = text.trim();
      return (trimmed.startsWith('{') && trimmed.endsWith('}')) || 
             (trimmed.startsWith('[') && trimmed.endsWith(']'));
    } catch {
      return false;
    }
  }
  
  /**
   * Check if text content is XML
   * @param text The text to check
   * @returns True if the text appears to be XML
   */
  private is_xml_content(text: string): boolean {
    const xmlPattern = /<\?xml[^>]*\?>/i;
    return xmlPattern.test(text);
  }
  
  /**
   * Extract metadata from binary content
   * @param buffer The buffer to analyze
   * @param contentType The detected content type
   * @returns Metadata extracted from the content
   */
  extract_metadata(buffer: Buffer, contentType: ContentType): Record<string, any> {
    const metadata: Record<string, any> = {
      size: buffer.length,
      content_type: contentType
    };
    
    // Add content-specific metadata extraction here
    // This is a simplified implementation
    
    return metadata;
  }
  
  /**
   * Process transaction data to extract binary content
   * @param transaction The transaction to process
   * @returns Processed binary data or null if no binary data found
   */
  process_transaction(transaction: any): { content_type: string; data: Buffer; metadata: Record<string, any> } | null {
    try {
      // Extract binary data from transaction outputs
      // This is a simplified implementation
      const outputs = transaction.out || [];
      
      for (const output of outputs) {
        // Check for binary data in output scripts
        const script = output.s2 || '';
        
        // Try to decode base64 data if present
        if (script.includes('base64,')) {
          const base64Match = script.match(/base64,([A-Za-z0-9+/=]+)/i);
          
          if (base64Match && base64Match[1]) {
            try {
              const buffer = Buffer.from(base64Match[1], 'base64');
              
              if (buffer.length > 0) {
                const contentType = this.detect_content_type(buffer);
                const metadata = this.extract_metadata(buffer, contentType);
                
                return {
                  content_type: contentType,
                  data: buffer,
                  metadata
                };
              }
            } catch (error) {
              this.logger.warn('Error decoding base64 data', {
                error: (error as Error).message,
                transaction_id: transaction.tx?.h
              });
            }
          }
        }
        
        // Try to extract hex-encoded data
        if (script.length > 20 && /^[0-9A-Fa-f]+$/.test(script)) {
          try {
            const buffer = Buffer.from(script, 'hex');
            
            if (buffer.length > 0) {
              const contentType = this.detect_content_type(buffer);
              const metadata = this.extract_metadata(buffer, contentType);
              
              return {
                content_type: contentType,
                data: buffer,
                metadata
              };
            }
          } catch (error) {
            this.logger.warn('Error decoding hex data', {
              error: (error as Error).message,
              transaction_id: transaction.tx?.h
            });
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error processing transaction for binary data', {
        error: (error as Error).message,
        transaction_id: transaction.tx?.h
      });
      
      return null;
    }
  }
}

// Export singleton instance
export const binary_data_processor = new BinaryDataProcessor();

// Export default for direct instantiation
export default BinaryDataProcessor;
