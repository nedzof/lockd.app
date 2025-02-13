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
    fastestFee?: number;
    halfHourFee?: number;
    hourFee?: number;
    regular?: number;
    economy?: number;
}

interface GorillaPoolFeeQuote {
    mine: {
        fees: {
            data: {
                standard: {
                    satoshis: number;
                    bytes: number;
                };
            }[];
        };
    };
}

/**
 * Fetches current fee rate from GorillaPool mAPI with WhatsOnChain as backup
 * Returns fee rate in satoshis per byte
 */
export async function getFeeRate(): Promise<number> {
    try {
        // Try GorillaPool mAPI first
        const response = await fetch('https://mapi.gorillapool.io/mapi/feeQuote');
        if (response.ok) {
            const data = await response.json() as GorillaPoolFeeQuote;
            const standardFee = data.mine?.fees?.data?.[0]?.standard;
            if (standardFee && standardFee.satoshis > 0 && standardFee.bytes > 0) {
                const feeRate = standardFee.satoshis / standardFee.bytes;
                console.log('Using GorillaPool fee rate:', feeRate);
                return Math.max(feeRate, 0.5); // Ensure minimum 0.5 sat/byte
            }
        }

        // Fallback to WhatsOnChain if GorillaPool fails
        console.log('Falling back to WhatsOnChain for fee rate...');
        const wocResponse = await fetch('https://api.whatsonchain.com/v1/bsv/main/mempool/fees');
        if (wocResponse.ok) {
            const data = await wocResponse.json() as FeeRateResponse;
            const feeRate = data.regular || data.economy || 0.5;
            console.log('Using WhatsOnChain fee rate:', feeRate);
            return feeRate;
        }

        // If both fail, use default rate
        console.warn('Both fee rate services failed, using default rate');
        return 0.5;
    } catch (error) {
        console.warn('Error fetching fee rate, using default rate:', error);
        return 0.5;
    }
} 