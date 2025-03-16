/**
 * Logger service
 * 
 * Provides a consistent logging interface for the application
 */

import { createLogger, format, transports } from 'winston';

// Create and configure winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ level, message, timestamp, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
    })
  ),
  transports: [
    new transports.Console()
  ]
});

export default logger;
