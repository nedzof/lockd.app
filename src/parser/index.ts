/**
 * Parser module entry point
 */
import { MainParser } from './main_parser.js';

// Create a singleton instance of the main parser
const parser = new MainParser();

// Export the singleton parser instance
export { parser };

// Also export individual parser classes for direct usage if needed
export { BaseParser } from './base_parser.js';
export { TransactionDataParser } from './transaction_data_parser.js';
export { LockProtocolParser } from './lock_protocol_parser.js';
export { MediaParser } from './media_parser.js';
export { VoteParser } from './vote_parser.js';
export { MainParser } from './main_parser.js';
export { BsvContentParser } from './bsv_content_parser.js';

// Export helper functions
export * from './utils/helpers.js';
