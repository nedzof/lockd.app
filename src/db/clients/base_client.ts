/**
 * Base Database Client
 * 
 * Provides common database operations, retry logic, and utility functions.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports, Logger } from 'winston';

export class BaseDbClient {
  protected prisma: PrismaClient;
  protected logger: Logger;
  protected maxRetries: number;
  protected retryDelayMs: number;
  
  constructor(maxRetries = 3, retryDelayMs = 1000) {
    // Initialize Prisma client
    this.prisma = new PrismaClient();
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    
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
   * Execute a database operation with retry logic
   * @param operation The database operation to execute
   * @returns The result of the operation
   */
  protected async with_retry<T>(operation: () => Promise<T>): Promise<T> {
    let retries = 0;
    
    while (true) {
      try {
        return await operation();
      } catch (error) {
        retries++;
        
        if (retries >= this.maxRetries) {
          this.logger.error('Max retries reached for database operation', { 
            retries, 
            error: (error as Error).message 
          });
          throw error;
        }
        
        this.logger.warn('Retrying database operation after error', { 
          retry: retries, 
          delay_ms: this.retryDelayMs,
          error: (error as Error).message 
        });
        
        // Wait for retry delay
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }
  
  /**
   * Safely disconnect from the database
   */
  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.logger.info('Disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database', { 
        error: (error as Error).message 
      });
    }
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
}

// Export default for inheritance
export default BaseDbClient;
