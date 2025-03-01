// src/config.ts
// Default configuration
export const CONFIG = {
    // Jungle Bus subscription ID
    JB_SUBSCRIPTION_ID: process.env.JB_SUBSCRIPTION_ID || 'lockd-app',
    
    // Default start block if none is specified
    DEFAULT_START_BLOCK: 885675,
    
    // Database connection timeout in milliseconds
    DB_TIMEOUT_MS: 30000, // 30 seconds
    
    // Maximum number of retries for database operations
    DB_MAX_RETRIES: 3,
    
    // Delay between retries in milliseconds
    DB_RETRY_DELAY_MS: 1000, // 1 second
    
    // Transaction processing timeout in milliseconds
    TX_PROCESSING_TIMEOUT_MS: 60000, // 60 seconds
    
    // Maximum batch size for processing transactions
    TX_BATCH_SIZE: 5,
    
    // API port
    API_PORT: process.env.PORT || 3003,
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Debug mode
    DEBUG: process.env.DEBUG === 'true'
};