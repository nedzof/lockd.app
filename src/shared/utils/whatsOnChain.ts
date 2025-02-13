/**
 * Fetches transaction data from WhatsOnChain API
 */
export async function fetchTransactionData(txid: string): Promise<any> {
    try {
        const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const txHex = await response.text();
        return { hex: txHex };
    } catch (error) {
        console.error('Error fetching transaction data:', error);
        return null;
    }
}

interface FeeRateResponse {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    regular: number;
}

/**
 * Fetches current fee rate from WhatsOnChain API
 * Returns fee rate in satoshis per byte
 */
export async function getFeeRate(): Promise<number> {
    try {
        // Use the mempool/fees endpoint instead of /fees
        const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/mempool/fees');
        if (!response.ok) {
            console.warn(`Fee rate API returned ${response.status}, using default rate`);
            return 0.5; // Default to 0.5 sat/byte
        }
        const data = await response.json();
        // Return the regular fee rate, defaulting to 0.5 sat/byte if not available
        return data.regular || data.economy || 0.5;
    } catch (error) {
        console.warn('Error fetching fee rate, using default rate:', error);
        // Default to 0.5 sat/byte if API call fails
        return 0.5;
    }
} 