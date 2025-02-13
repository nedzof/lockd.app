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
        const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/fees');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json() as FeeRateResponse;
        // Return the regular fee rate, defaulting to 0.5 sat/byte if not available
        return data.regular || 0.5;
    } catch (error) {
        console.error('Error fetching fee rate:', error);
        // Default to 0.5 sat/byte if API call fails
        return 0.5;
    }
} 