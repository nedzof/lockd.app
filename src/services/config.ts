// src/config.ts
// Default configuration
export const CONFIG = {
    // Jungle Bus configuration
    // Using explicit fallback value from .env if process.env isn't loading properly
    JB_SUBSCRIPTION_ID: process.env.JB_SUBSCRIPTION_ID || '605c94f88595f065c364aab2253e36bf95bc2f4e8b4ee6b4fe7149484f7a8118',
    JUNGLEBUS_API_KEY: process.env.JUNGLEBUS_API_KEY || '',
    JUNGLEBUS_URL: process.env.JUNGLEBUS_URL || 'https://junglebus.gorillapool.io',
    
    // Default start block if none is specified
    DEFAULT_START_BLOCK: 885872,
    
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
    DEBUG: process.env.DEBUG === 'true',
    
    // Retry configuration for JungleBus
    JB_MAX_RETRIES: 5,
    JB_RETRY_DELAY_MS: 1000, // 1 second initial delay
    JB_MAX_RETRY_DELAY_MS: 30000, // 30 seconds maximum delay
};