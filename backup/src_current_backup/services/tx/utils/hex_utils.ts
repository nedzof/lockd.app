/**
 * Hex Utilities
 * 
 * Provides utility functions for handling hexadecimal data
 */

/**
 * Decodes hexadecimal data to UTF-8 string
 */
export function decode_hex_to_utf8(hex: string): string {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const buffer = Buffer.from(cleanHex, 'hex');
    return buffer.toString('utf8');
  } catch (error) {
    return '';
  }
}

/**
 * Checks if a string is valid hexadecimal
 */
export function is_valid_hex(hex: string): boolean {
  return /^[0-9a-f]*$/i.test(hex);
}

/**
 * Converts text to hexadecimal
 */
export function text_to_hex(text: string): string {
  return Buffer.from(text).toString('hex');
}

/**
 * Utility function to decode hex string to UTF-8 (for backward compatibility)
 */
export function decode_hex_string(hex: string): string {
  return decode_hex_to_utf8(hex);
} 