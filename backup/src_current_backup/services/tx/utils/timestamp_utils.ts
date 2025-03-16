/**
 * Timestamp Utilities
 * 
 * Provides utility functions for handling timestamps
 */

/**
 * Extracts timestamp from transaction data
 */
export function extract_timestamp(txData: any): string {
  if (txData.block_time) {
    return new Date(txData.block_time * 1000).toISOString();
  } 
  if (txData.time) {
    return new Date(txData.time * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Format a possibly malformed timestamp into ISO format
 */
export function format_timestamp(timestamp: string): string {
  // If timestamp appears to be just a year
  if (/^20\d{2}$/.test(timestamp)) {
    return `${timestamp}-01-01T00:00:00Z`;
  }
  
  // If timestamp appears to be year and month
  if (/^20\d{2}-\d{2}$/.test(timestamp)) {
    return `${timestamp}-01T00:00:00Z`;
  }
  
  // If timestamp appears to be a date with no time
  if (/^20\d{2}-\d{2}-\d{2}$/.test(timestamp)) {
    return `${timestamp}T00:00:00Z`;
  }
  
  // If timestamp appears to be a date with partial time
  if (/^20\d{2}-\d{2}-\d{2}T\d{2}(:\d{2})?$/.test(timestamp)) {
    // Add seconds if missing
    if (timestamp.split(':').length === 1) {
      return `${timestamp}:00:00Z`;
    } else {
      return `${timestamp}:00Z`;
    }
  }
  
  // If timestamp appears to be a date with time but no Z
  if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    return `${timestamp}Z`;
  }
  
  // If timestamp appears to be complete but missing milliseconds
  if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) {
    return timestamp;
  }
  
  // Return as is for any other case
  return timestamp;
}

/**
 * Checks if a string is a valid ISO timestamp
 */
export function is_valid_iso_timestamp(timestamp: string): boolean {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  return isoDateRegex.test(timestamp);
} 