/**
 * Base Parser
 * 
 * Provides common functionality for all specialized parsers.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';

export class BaseParser {
  protected logger: Logger;

  constructor() {
    // Initialize logger with standard configuration
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
   * Log an informational message
   * @param message The message to log
   * @param meta Additional metadata
   */
  protected log_info(message: string, meta: Record<string, any> = {}): void {
    this.logger.info(message, meta);
  }

  /**
   * Log an error message
   * @param message The error message
   * @param error The error object
   * @param meta Additional metadata
   */
  protected log_error(message: string, error: Error | null = null, meta: Record<string, any> = {}): void {
    const errorData = error ? { 
      error_message: error.message, 
      stack: error.stack 
    } : {};
    
    this.logger.error(message, { ...errorData, ...meta });
  }

  /**
   * Log a warning message
   * @param message The warning message
   * @param meta Additional metadata
   */
  protected log_warning(message: string, meta: Record<string, any> = {}): void {
    this.logger.warn(message, meta);
  }

  /**
   * Safely parse JSON with error handling
   * @param jsonString The JSON string to parse
   * @returns The parsed object or null if parsing failed
   */
  protected safe_parse_json(jsonString: string): any | null {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      this.log_error('Failed to parse JSON', error as Error, { jsonString });
      return null;
    }
  }

  /**
   * Check if a value is a valid non-empty string
   * @param value The value to check
   * @returns True if the value is a non-empty string
   */
  protected is_valid_string(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Safely access a property from an object with type checking
   * @param obj The object to access
   * @param path The property path (e.g., 'user.profile.name')
   * @param defaultValue The default value to return if the property doesn't exist
   * @returns The property value or the default value
   */
  protected safe_get(obj: any, path: string, defaultValue: any = null): any {
    if (!obj) return defaultValue;
    
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === undefined || result === null) return defaultValue;
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  }
}

// Export singleton instance
export const base_parser = new BaseParser();

// Export default for inheritance
export default BaseParser;
