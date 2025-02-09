import { 
    Signer, 
    SignatureResponse, 
    Provider, 
    MethodCallOptions, 
    SignatureRequest,
    SignTransactionOptions,
    TransactionResponse,
    UtxoQueryOptions,
    UTXO,
    bsv 
} from 'scrypt-ts';
import type { useYoursWallet } from 'yours-wallet-provider';
import type { MimeTypes } from 'yours-wallet-provider';

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

// Helper function to validate MIME type
function validateMimeType(type: string): MimeTypes {
    // Clean up the content type by removing any prefixes, newlines, or extra whitespace
    const cleanType = type
        .replace(/^Q\t?/, '') // Remove Q prefix with or without tab
        .replace(/^Q(?=[a-z])/, '') // Remove Q when directly followed by content type
        .replace(/\r?\n/g, '') // Remove newlines
        .trim(); // Remove extra whitespace

    console.log('MIME type cleaning:', {
        original: type,
        afterCleaning: cleanType,
        steps: {
            removeQTab: type.replace(/^Q\t?/, ''),
            removeQPrefix: type.replace(/^Q(?=[a-z])/, ''),
            removeNewlines: type.replace(/\r?\n/g, ''),
            finalTrim: type.replace(/\r?\n/g, '').trim()
        }
    });

    const validTypes = [
        "text/plain",
        "text/markdown",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
        "application/json"
    ] as const;

    if (!validTypes.includes(cleanType as any)) {
        throw new Error(`Invalid MIME type: ${cleanType}. Must be one of: ${validTypes.join(', ')}`);
    }

    return cleanType as MimeTypes;
}

// Helper function to broadcast transaction
async function broadcastTransaction(txHex: string): Promise<string> {
    const url = 'https://api.whatsonchain.com/v1/bsv/test/tx/raw';
    
    try {
        // Parse the transaction to get the txid
        const tx = new bsv.Transaction(txHex);
        
        // Log the request details
        const requestBody = { txhex: txHex };
        console.log('Broadcasting transaction request:', {
            url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            bodyLength: txHex.length,
            bodyPreview: `${txHex.substring(0, 100)}...${txHex.substring(txHex.length - 100)}`,
            txid: tx.id,
            inputCount: tx.inputs.length,
            outputCount: tx.outputs.length
        });

        // Make the API request
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        // Log the response details
        const responseText = await response.text();
        console.log('Broadcast response:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseText,
            txid: tx.id
        });

        // Check if the response indicates a mempool conflict
        if (!response.ok) {
            // Try to parse error message if possible
            let errorMessage = responseText;
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.message || errorJson.error || responseText;
            } catch {
                // If we can't parse JSON, use the raw text
            }

            // Check for specific error cases
            if (errorMessage.includes('txn-mempool-conflict') || 
                errorMessage.includes('Transaction already in the mempool')) {
                console.log('Transaction already in mempool:', {
                    txid: tx.id,
                    size: txHex.length / 2,
                    error: errorMessage,
                    timestamp: new Date().toISOString()
                });
                return tx.id; // Return the txid since the transaction is already in the mempool
            }

            // For other errors, log details and throw
            console.error('Broadcast error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorMessage,
                request: {
                    txid: tx.id,
                    size: txHex.length / 2,
                    inputCount: tx.inputs.length,
                    outputCount: tx.outputs.length
                }
            });

            throw new Error(`Failed to broadcast transaction: ${response.status} ${response.statusText} - ${errorMessage}`);
        }

        // The response should be the txid as plain text
        const txid = responseText
            .trim() // Remove whitespace and newlines
            .replace(/^"/, '') // Remove leading quote
            .replace(/"$/, '') // Remove trailing quote
            .replace(/\n$/, ''); // Remove trailing newline if present

        console.log('Cleaned txid response:', {
            original: responseText,
            afterTrim: responseText.trim(),
            afterQuoteRemoval: responseText.trim().replace(/^"/, '').replace(/"$/, ''),
            final: txid
        });

        if (!txid.match(/^[0-9a-f]{64}$/i)) {
            console.error('Invalid txid format:', {
                receivedTxid: responseText,
                cleanedTxid: txid,
                responseText: responseText,
                expectedTxid: tx.id,
                matches: {
                    length64: txid.length === 64,
                    hexOnly: /^[0-9a-f]+$/i.test(txid),
                    fullRegex: /^[0-9a-f]{64}$/i.test(txid)
                }
            });
            throw new Error(`Invalid txid format received: ${responseText}`);
        }

        console.log('Transaction broadcast successful:', {
            txid,
            expectedTxid: tx.id,
            size: txHex.length / 2,
            responseTime: new Date().toISOString()
        });
        
        return txid;
    } catch (error) {
        console.error('Broadcast error details:', error);
        throw error;
    }
}

export class YoursWalletAdapter implements Signer {
    private wallet: YoursWallet;
    public provider: Provider;
    public readonly _isSigner = true;

    constructor(wallet: YoursWallet, provider: Provider) {
        this.wallet = wallet;
        this.provider = provider;
    }

    get connectedProvider(): Provider {
        return this.provider;
    }

    async isAuthenticated(): Promise<boolean> {
        return this.wallet.isConnected?.() || false;
    }

    async requestAuth(): Promise<{ isAuthenticated: boolean; error: string }> {
        try {
            await this.wallet.connect();
            return { isAuthenticated: true, error: '' };
        } catch (e) {
            return { isAuthenticated: false, error: (e as Error).message };
        }
    }

    async getDefaultAddress(): Promise<bsv.Address> {
        const addresses = await this.wallet.getAddresses();
        if (!addresses?.bsvAddress) {
            throw new Error('No BSV address available');
        }
        return bsv.Address.fromString(addresses.bsvAddress);
    }

    async getNetwork(): Promise<bsv.Networks.Network> {
        return bsv.Networks.testnet; // TODO: Get from wallet when available
    }

    async getDefaultPubKey(): Promise<bsv.PublicKey> {
        throw new Error('getDefaultPubKey not implemented');
    }

    async getPubKey(address: bsv.Address): Promise<bsv.PublicKey> {
        throw new Error('getPubKey not implemented');
    }

    async getBalance(address?: bsv.Address): Promise<{ confirmed: number; unconfirmed: number }> {
        const balance = await this.wallet.getBalance();
        if (!balance?.satoshis) {
            throw new Error('Could not get balance');
        }
        return {
            confirmed: balance.satoshis,
            unconfirmed: 0
        };
    }

    async signMessage(message: string): Promise<string> {
        throw new Error('signMessage not implemented');
    }

    async signTransaction(tx: bsv.Transaction, options?: SignTransactionOptions): Promise<bsv.Transaction> {
        console.log('Signing transaction:', {
            nInputs: tx.inputs.length,
            nOutputs: tx.outputs.length,
            inputs: tx.inputs.map(input => ({
                prevTxId: input.prevTxId.toString('hex'),
                outputIndex: input.outputIndex,
                sequenceNumber: input.sequenceNumber,
                script: input.script?.toHex() || '',
                output: {
                    satoshis: input.output?.satoshis,
                    script: input.output?.script?.toHex()
                }
            })),
            outputs: tx.outputs.map(output => ({
                satoshis: output.satoshis,
                script: output.script.toHex()
            }))
        });

        // Get UTXOs for signing
        const utxos = await this.listUnspent(await this.getDefaultAddress());
        console.log('UTXOs for signing:', utxos);

        if (!utxos.length) {
            throw new Error('No UTXOs available for signing');
        }

        // Create a new transaction to avoid modifying the original
        const newTx = new bsv.Transaction(tx.toString());

        // Add UTXOs to transaction inputs
        for (let i = 0; i < newTx.inputs.length; i++) {
            const input = newTx.inputs[i];
            const utxo = utxos.find(u => 
                u.txId === input.prevTxId.toString('hex') && 
                u.outputIndex === input.outputIndex
            );
            if (!utxo) {
                console.error('Available UTXOs:', utxos);
                throw new Error(`Could not find UTXO for input ${i} (prevTxId: ${input.prevTxId.toString('hex')}, outputIndex: ${input.outputIndex})`);
            }
            
            // Set the output information
            input.output = new bsv.Transaction.Output({
                script: bsv.Script.fromHex(utxo.script),
                satoshis: utxo.satoshis
            });

            // Always create a new input with empty script
            const newInput = new bsv.Transaction.Input({
                prevTxId: input.prevTxId,
                outputIndex: input.outputIndex,
                script: bsv.Script.empty(), // Initialize with empty script
                output: input.output,
                sequenceNumber: input.sequenceNumber
            });
            newTx.inputs[i] = newInput;

            console.log(`Input ${i} initialized:`, {
                prevTxId: newInput.prevTxId.toString('hex'),
                outputIndex: newInput.outputIndex,
                script: newInput.script.toHex(),
                output: {
                    satoshis: newInput.output?.satoshis,
                    script: newInput.output?.script.toHex()
                }
            });
        }

        // Validate the transaction after inputs are populated
        try {
            // Validate transaction structure
            if (!newTx.inputs.length || !newTx.outputs.length) {
                throw new Error('Invalid transaction format: Missing inputs or outputs');
            }

            // Validate each input has required fields
            for (let i = 0; i < newTx.inputs.length; i++) {
                const input = newTx.inputs[i];
                if (!input.output || !input.output.script || typeof input.output.satoshis !== 'number') {
                    throw new Error(`Input ${i} is missing output information`);
                }
                if (!input.script) {
                    throw new Error(`Input ${i} is missing script object`);
                }
            }

            console.log('Transaction validation passed:', {
                nInputs: newTx.inputs.length,
                nOutputs: newTx.outputs.length,
                txid: newTx.id,
                inputs: newTx.inputs.map(input => ({
                    prevTxId: input.prevTxId.toString('hex'),
                    outputIndex: input.outputIndex,
                    script: input.script.toHex(),
                    output: {
                        satoshis: input.output?.satoshis,
                        script: input.output?.script.toHex()
                    }
                }))
            });
        } catch (error) {
            console.error('Transaction validation failed:', error);
            throw error;
        }

        // For ordinal inscriptions, we need to use the inscribe method
        const isOrdinalInscription = newTx.outputs.some(output => 
            output.script.toHex().includes('6f7264') // 'ord' in hex
        );

        if (isOrdinalInscription) {
            try {
                // Extract the content and content type from the ordinal output
                const ordOutput = newTx.outputs.find(output => 
                    output.script.toHex().includes('6f7264')
                );
                if (!ordOutput) {
                    throw new Error('Could not find ordinal output');
                }

                // Convert hex to base64 in chunks
                function hexToBase64(hexString: string): string {
                    // Process in chunks of 10000 bytes
                    const CHUNK_SIZE = 10000;
                    let base64 = '';
                    
                    for (let i = 0; i < hexString.length; i += CHUNK_SIZE * 2) {
                        const chunk = hexString.slice(i, i + CHUNK_SIZE * 2);
                        const bytes = new Uint8Array(chunk.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
                        
                        // Convert chunk to string
                        let binary = '';
                        for (let j = 0; j < bytes.length; j++) {
                            binary += String.fromCharCode(bytes[j]);
                        }
                        
                        // Convert binary chunk to base64
                        base64 += btoa(binary);
                    }
                    
                    return base64;
                }

                // Extract the content type (no change needed here)
                const script = ordOutput.script.toHex();
                console.log('Ordinal script:', {
                    script,
                    ordLocation: script.indexOf('6f7264'),
                    fullHex: script
                });

                // Find the content type marker
                const contentTypeMarker = '6f7264'; // 'ord' in hex
                const contentTypeStart = script.indexOf(contentTypeMarker) + contentTypeMarker.length;
                
                // Read until we find the first '00' after the content type marker
                let contentType = '';
                let currentPos = contentTypeStart;
                while (currentPos < script.length - 1) {
                    const byte = script.substr(currentPos, 2);
                    if (byte === '00') break;
                    contentType += byte;
                    currentPos += 2;
                }
                
                // Convert hex to string
                contentType = Array.from(contentType.match(/.{2}/g) || [])
                    .map(byte => String.fromCharCode(parseInt(byte, 16)))
                    .join('');

                console.log('Extracted content type:', {
                    contentType,
                    rawHex: script.substring(contentTypeStart, currentPos),
                    cleanedType: contentType
                        .replace(/^Q\t?/, '')
                        .replace(/^Q(?=[a-z])/, '')
                        .replace(/\r?\n/g, '')
                        .trim()
                });

                // Skip past the content type and its null terminator
                const contentStart = currentPos + 2; // Skip the '00' terminator
                const contentHex = script.slice(contentStart);

                console.log('Content extraction:', {
                    contentStartPos: contentStart,
                    contentLength: contentHex.length,
                    contentPreview: contentHex.substring(0, 100)
                });

                // Convert hex to base64 using chunked approach
                const base64Content = hexToBase64(contentHex);

                // Use the inscribe method with validated MIME type
                const result = await this.wallet.inscribe([{
                    address: (await this.getDefaultAddress()).toString(),
                    base64Data: base64Content,
                    mimeType: validateMimeType(contentType),
                    satoshis: ordOutput.satoshis
                }]);

                if (!result?.txid) {
                    throw new Error('Failed to inscribe');
                }

                // Parse the raw transaction
                const signedTx = new bsv.Transaction(result.rawtx);
                console.log('Inscription transaction:', {
                    txid: result.txid,
                    rawTxLength: result.rawtx.length,
                    nInputs: signedTx.inputs.length,
                    nOutputs: signedTx.outputs.length,
                    rawTx: result.rawtx
                });

                // Explicitly broadcast the transaction
                try {
                    console.log('Broadcasting transaction...');
                    const broadcastTxid = await broadcastTransaction(result.rawtx);
                    console.log('Transaction broadcast successful:', broadcastTxid);
                    
                    // Create new transaction with broadcast txid
                    const broadcastTx = new bsv.Transaction(result.rawtx);
                    return broadcastTx;
                } catch (error) {
                    // Check if this is a mempool conflict
                    if (error instanceof Error && 
                        (error.message.includes('txn-mempool-conflict') || 
                         error.message.includes('Transaction already in the mempool'))) {
                        console.log('Transaction already in mempool, using original transaction');
                        return signedTx;
                    }
                    throw error;
                }
            } catch (error) {
                // Check if this is a mempool conflict at any stage
                if (error instanceof Error && 
                    (error.message.includes('txn-mempool-conflict') || 
                     error.message.includes('Transaction already in the mempool'))) {
                    console.log('Transaction already in mempool:', error);
                    return tx; // Return the original transaction
                }
                throw error;
            }
        }

        // For non-ordinal transactions, use sendBsv
        const params = [{
            satoshis: tx.outputs[0].satoshis,
            script: tx.outputs[0].script.toHex(),
            data: tx.outputs.slice(1).map(output => output.script.toHex())
        }];

        // Send the transaction using the wallet's sendBsv method
        console.log('Sending transaction with params:', params);
        const result = await this.wallet.sendBsv(params);
        console.log('Send result:', result);

        if (!result?.txid) {
            throw new Error('Failed to sign and broadcast transaction');
        }

        // Parse the raw transaction
        const signedTx = new bsv.Transaction(result.rawtx);
        console.log('Signed transaction:', {
            txid: result.txid,
            rawTxLength: result.rawtx.length,
            nInputs: signedTx.inputs.length,
            nOutputs: signedTx.outputs.length
        });

        return signedTx;
    }

    async signRawTransaction(rawTxHex: string, options: SignTransactionOptions): Promise<string> {
        console.log('Signing raw transaction:', {
            rawTxLength: rawTxHex.length,
            options
        });

        const tx = new bsv.Transaction(rawTxHex);
        const signedTx = await this.signTransaction(tx, options);
        return signedTx.toString();
    }

    async getSignatures(rawTxHex: string, sigRequests: SignatureRequest[]): Promise<SignatureResponse[]> {
        throw new Error('getSignatures not implemented');
    }

    async signAndsendTransaction(tx: bsv.Transaction, options?: SignTransactionOptions): Promise<any> {
        console.log('Signing and sending transaction:', {
            nInputs: tx.inputs.length,
            nOutputs: tx.outputs.length,
            inputs: tx.inputs.map(input => ({
                prevTxId: input.prevTxId.toString('hex'),
                outputIndex: input.outputIndex,
                sequenceNumber: input.sequenceNumber,
                script: input.script.toHex(),
                output: {
                    satoshis: input.output?.satoshis,
                    script: input.output?.script.toHex()
                }
            })),
            outputs: tx.outputs.map(output => ({
                satoshis: output.satoshis,
                script: output.script.toHex()
            }))
        });

        // Sign and broadcast the transaction
        const signedTx = await this.signTransaction(tx, options);
        console.log('Transaction signed and broadcast:', {
            txid: signedTx.id,
            rawTxLength: signedTx.toString().length
        });

        // Return in the format expected by scrypt-ord
        return {
            id: signedTx.id,
            tx: signedTx
        };
    }

    async listUnspent(address: bsv.Address, options?: UtxoQueryOptions): Promise<UTXO[]> {
        const utxos = await this.wallet.getPaymentUtxos();
        if (!utxos) {
            return [];
        }
        return utxos.map(utxo => ({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            satoshis: utxo.satoshis,
            script: utxo.script
        }));
    }

    async alignProviderNetwork(): Promise<void> {
        // No-op since we're already on testnet
    }

    getProvider(): Provider {
        return this.provider;
    }

    setProvider(provider: Provider): void {
        this.provider = provider;
    }

    connect(provider: Provider): this {
        this.provider = provider;
        return this;
    }
} 