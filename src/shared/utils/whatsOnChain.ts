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