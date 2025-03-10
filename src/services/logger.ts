/**
 * Logger service
 * 
 * Provides a consistent logging interface for the application
 */

import { createLogger, format, transports } from 'winston';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const LOG_DIR = 'logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// Custom format for console output with colors
const consoleFormat = format.printf(({ level, message, timestamp, ...meta }) => {
  const colorize = {
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray,
  } as const;
  
  const color = colorize[level as keyof typeof colorize] || chalk.white;
  return `${chalk.gray(timestamp)} ${color(`[${level.toUpperCase()}]`)}: ${message} ${
    Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
  }`;
});

// Create and configure winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    // Console transport with colors
    new transports.Console({
      format: format.combine(
        format.timestamp(),
        consoleFormat
      )
    }),
    // File transport for all logs
    new transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),
    // File transport for error logs
    new transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),
    // File transport for scanner logs
    new transports.File({
      filename: path.join(LOG_DIR, 'scanner.log'),
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});

export default logger;
