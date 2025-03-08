/**
 * Utility functions for working with hexadecimal data
 */

/**
 * Convert a hexadecimal string to UTF-8 string
 * @param {string} hex - The hexadecimal string to convert
 * @returns {string} The UTF-8 string
 */
export function hexToUtf8(hex) {
  try {
    // Remove '0x' prefix if present
    hex = hex.startsWith('0x') ? hex.slice(2) : hex;
    
    // Ensure even number of characters
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    
    // Convert hex to bytes and then to string
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      str += String.fromCharCode(byte);
    }
    
    // Try to decode as UTF-8
    try {
      return decodeURIComponent(escape(str));
    } catch (e) {
      // If decoding fails, return the raw string
      return str;
    }
  } catch (error) {
    console.error('Error converting hex to UTF-8:', error);
    return '';
  }
}

/**
 * Convert a UTF-8 string to hexadecimal string
 * @param {string} str - The UTF-8 string to convert
 * @returns {string} The hexadecimal string
 */
export function utf8ToHex(str) {
  try {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      const hexValue = charCode.toString(16);
      
      // Ensure two characters for each byte
      hex += hexValue.padStart(2, '0');
    }
    return hex;
  } catch (error) {
    console.error('Error converting UTF-8 to hex:', error);
    return '';
  }
}
