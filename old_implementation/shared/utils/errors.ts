/**
 * Base error class for all application errors
 */
export class AppError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Transaction-related errors
 */
export class TransactionError extends AppError {
    constructor(
        message: string,
        code: string,
        public txid?: string,
        public details?: any
    ) {
        super(message, code);
    }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
    constructor(
        message: string,
        code: string,
        public field?: string,
        public value?: any
    ) {
        super(message, code);
    }
}

/**
 * Blockchain-related errors
 */
export class BlockchainError extends AppError {
    constructor(
        message: string,
        code: string,
        public blockHeight?: number,
        public details?: any
    ) {
        super(message, code);
    }
}

/**
 * Wallet-related errors
 */
export class WalletError extends AppError {
    constructor(
        message: string,
        code: string,
        public walletType?: string,
        public details?: any
    ) {
        super(message, code);
    }
}

/**
 * API-related errors
 */
export class ApiError extends AppError {
    constructor(
        message: string,
        code: string,
        public status?: number,
        public endpoint?: string
    ) {
        super(message, code);
    }
}

/**
 * Error codes for different types of errors
 */
export const ErrorCodes = {
    // Transaction errors
    TX_INSUFFICIENT_FUNDS: 'TX_INSUFFICIENT_FUNDS',
    TX_BUILD_FAILED: 'TX_BUILD_FAILED',
    TX_BROADCAST_FAILED: 'TX_BROADCAST_FAILED',
    TX_VALIDATION_FAILED: 'TX_VALIDATION_FAILED',
    TX_TIMEOUT: 'TX_TIMEOUT',
    TX_FETCH_FAILED: 'TX_FETCH_FAILED',

    // Validation errors
    INVALID_ADDRESS: 'INVALID_ADDRESS',
    INVALID_AMOUNT: 'INVALID_AMOUNT',
    INVALID_SIGNATURE: 'INVALID_SIGNATURE',
    INVALID_PUBLIC_KEY: 'INVALID_PUBLIC_KEY',
    INVALID_BLOCK_HEIGHT: 'INVALID_BLOCK_HEIGHT',
    INVALID_LOCK_STATUS: 'INVALID_LOCK_STATUS',

    // Blockchain errors
    BLOCK_HEIGHT_FETCH_FAILED: 'BLOCK_HEIGHT_FETCH_FAILED',
    UTXO_FETCH_FAILED: 'UTXO_FETCH_FAILED',

    // Wallet errors
    WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
    WALLET_CONNECTION_FAILED: 'WALLET_CONNECTION_FAILED',
    WALLET_DISCONNECTED: 'WALLET_DISCONNECTED',

    // Lock errors
    LOCK_NOT_FOUND: 'LOCK_NOT_FOUND',
    LOCK_ALREADY_UNLOCKED: 'LOCK_ALREADY_UNLOCKED',
    LOCK_NOT_UNLOCKABLE: 'LOCK_NOT_UNLOCKABLE',

    // API errors
    API_ERROR: 'API_ERROR',
    API_TIMEOUT: 'API_TIMEOUT',
    API_INVALID_RESPONSE: 'API_INVALID_RESPONSE',
    API_RATE_LIMIT: 'API_RATE_LIMIT'
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * User-friendly error messages
 */
export const ErrorMessages: Record<ErrorCode, string> = {
    TX_INSUFFICIENT_FUNDS: 'Insufficient funds for transaction',
    TX_BUILD_FAILED: 'Failed to build transaction',
    TX_BROADCAST_FAILED: 'Failed to broadcast transaction',
    TX_VALIDATION_FAILED: 'Transaction validation failed',
    TX_TIMEOUT: 'Transaction timed out',
    TX_FETCH_FAILED: 'Failed to fetch transaction details',

    INVALID_ADDRESS: 'Invalid BSV address',
    INVALID_AMOUNT: 'Invalid amount',
    INVALID_SIGNATURE: 'Invalid signature',
    INVALID_PUBLIC_KEY: 'Invalid public key',
    INVALID_BLOCK_HEIGHT: 'Invalid block height',
    INVALID_LOCK_STATUS: 'Invalid lock status',

    BLOCK_HEIGHT_FETCH_FAILED: 'Failed to fetch current block height',
    UTXO_FETCH_FAILED: 'Failed to fetch UTXOs',

    WALLET_NOT_CONNECTED: 'Wallet not connected',
    WALLET_CONNECTION_FAILED: 'Failed to connect wallet',
    WALLET_DISCONNECTED: 'Wallet disconnected',

    LOCK_NOT_FOUND: 'Lock not found',
    LOCK_ALREADY_UNLOCKED: 'Lock is already unlocked',
    LOCK_NOT_UNLOCKABLE: 'Lock cannot be unlocked',

    API_ERROR: 'API error occurred',
    API_TIMEOUT: 'API request timed out',
    API_INVALID_RESPONSE: 'Invalid API response',
    API_RATE_LIMIT: 'API rate limit exceeded'
};

/**
 * Converts an error to a user-friendly message
 */
export function getUserFriendlyError(error: Error | AppError): string {
    if (error instanceof AppError) {
        return ErrorMessages[error.code] || error.message;
    }
    return error.message;
}

/**
 * Handles transaction errors and returns appropriate error instance
 */
export function handleTransactionError(error: any): TransactionError {
    if (error instanceof TransactionError) {
        return error;
    }

    // Handle insufficient funds
    if (error.message?.includes('insufficient') || error.message?.includes('balance')) {
        return new TransactionError(
            ErrorMessages[ErrorCodes.TX_INSUFFICIENT_FUNDS],
            ErrorCodes.TX_INSUFFICIENT_FUNDS,
            undefined,
            error
        );
    }

    // Handle broadcast failures
    if (error.message?.includes('broadcast') || error.message?.includes('mempool')) {
        return new TransactionError(
            ErrorMessages[ErrorCodes.TX_BROADCAST_FAILED],
            ErrorCodes.TX_BROADCAST_FAILED,
            undefined,
            error
        );
    }

    // Handle validation failures
    if (error.message?.includes('valid')) {
        return new TransactionError(
            ErrorMessages[ErrorCodes.TX_VALIDATION_FAILED],
            ErrorCodes.TX_VALIDATION_FAILED,
            undefined,
            error
        );
    }

    // Default to generic transaction error
    return new TransactionError(
        ErrorMessages[ErrorCodes.TX_BUILD_FAILED],
        ErrorCodes.TX_BUILD_FAILED,
        undefined,
        error
    );
}

/**
 * Handles blockchain-related errors
 */
export function handleBlockchainError(error: any): BlockchainError {
    if (error instanceof BlockchainError) {
        return error;
    }

    // Handle network errors
    if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
        return new BlockchainError(
            ErrorMessages[ErrorCodes.API_ERROR],
            ErrorCodes.API_ERROR,
            undefined,
            error
        );
    }

    // Handle block height errors
    if (error.message?.includes('block height')) {
        return new BlockchainError(
            ErrorMessages[ErrorCodes.BLOCK_HEIGHT_FETCH_FAILED],
            ErrorCodes.BLOCK_HEIGHT_FETCH_FAILED,
            undefined,
            error
        );
    }

    // Handle UTXO errors
    if (error.message?.includes('UTXO')) {
        return new BlockchainError(
            ErrorMessages[ErrorCodes.UTXO_FETCH_FAILED],
            ErrorCodes.UTXO_FETCH_FAILED,
            undefined,
            error
        );
    }

    return new BlockchainError(error.message, ErrorCodes.API_ERROR, undefined, error);
}

/**
 * Handles API-related errors
 */
export function handleApiError(error: any): ApiError {
    if (error instanceof ApiError) {
        return error;
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
        return new ApiError(
            ErrorMessages[ErrorCodes.API_RATE_LIMIT],
            ErrorCodes.API_RATE_LIMIT,
            429,
            error.config?.url
        );
    }

    // Handle timeouts
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return new ApiError(
            ErrorMessages[ErrorCodes.API_TIMEOUT],
            ErrorCodes.API_TIMEOUT,
            undefined,
            error.config?.url
        );
    }

    return new ApiError(
        ErrorMessages[ErrorCodes.API_INVALID_RESPONSE],
        ErrorCodes.API_INVALID_RESPONSE,
        error.response?.status,
        error.config?.url
    );
} 