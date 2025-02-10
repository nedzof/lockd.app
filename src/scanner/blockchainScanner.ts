interface BlockchainTransaction {
    media_url?: Promise<string | undefined>;
}

class BlockchainScanner {
    private network: string;

    private parseOrdinalContent(script: string): { hasOrd: boolean; mimeType?: string; isImage: boolean } {
        // Check for ordinal protocol marker
        if (!script.startsWith('63036f7264')) {
            return { hasOrd: false, isImage: false };
        }

        try {
            // Extract MIME type from the script
            const hexMimeType = script.substring(10, script.indexOf('00', 10));
            const mimeType = Buffer.from(hexMimeType, 'hex').toString('utf8');
            const isImage = mimeType.startsWith('image/');

            return { hasOrd: true, mimeType, isImage };
        } catch (error) {
            console.log(`Error parsing ordinal content: ${error}`);
            return { hasOrd: true, isImage: false };
        }
    }

    private async extractMediaUrl(txid: string, outputIndex: number, script: string): Promise<string | undefined> {
        const { hasOrd, mimeType, isImage } = this.parseOrdinalContent(script);
        
        if (!hasOrd || !isImage) {
            return undefined;
        }

        console.log(`Found image inscription in output ${outputIndex}: { txid: '${txid}', mimeType: '${mimeType}', script: '${script.substring(0, 100)}...' }`);

        // Try getting raw transaction output data
        const rawOutputUrl = `https://api.whatsonchain.com/v1/bsv/${this.network === 'testnet' ? 'test' : 'main'}/tx/${txid}/out/${outputIndex}/hex`;
        console.log(`Trying to get raw output data from: ${rawOutputUrl}`);
        
        try {
            const response = await fetch(rawOutputUrl);
            if (response.ok) {
                const rawHex = await response.text();
                console.log(`Raw output data length: ${rawHex.length} chars`);
                
                // Extract image data from the script
                const imageDataStart = script.indexOf('ffd8ffe000104a46494600');
                if (imageDataStart >= 0) {
                    const imageData = script.substring(imageDataStart);
                    console.log(`Found JPEG data starting at offset ${imageDataStart}, length: ${imageData.length} chars`);
                    
                    // Try to get the image content directly
                    const imageUrl = `https://api.whatsonchain.com/v1/bsv/${this.network === 'testnet' ? 'test' : 'main'}/tx/${txid}/out/${outputIndex}/content`;
                    console.log(`Trying to get image content from: ${imageUrl}`);
                    
                    const imageResponse = await fetch(imageUrl);
                    if (imageResponse.ok) {
                        console.log('Successfully retrieved image content');
                        return imageUrl;
                    }
                    console.log(`Failed to get image content: ${imageResponse.status}`);

                    // Try to get the raw script content
                    const scriptUrl = `https://api.whatsonchain.com/v1/bsv/${this.network === 'testnet' ? 'test' : 'main'}/tx/${txid}/out/${outputIndex}/script`;
                    console.log(`Trying to get script content from: ${scriptUrl}`);
                    
                    const scriptResponse = await fetch(scriptUrl);
                    if (scriptResponse.ok) {
                        console.log('Successfully retrieved script content');
                        return scriptUrl;
                    }
                    console.log(`Failed to get script content: ${scriptResponse.status}`);
                } else {
                    console.log('Could not find JPEG data in script');
                }
            } else {
                console.log(`Failed to get raw output data: ${response.status}`);
            }
        } catch (error) {
            console.log(`Error getting raw output data: ${error}`);
        }

        // Try bitails.io API as fallback
        const bitailsUrl = `https://api.bitails.io/download/tx/${txid}/output/${outputIndex}`;
        console.log(`Trying bitails.io API URL: ${bitailsUrl}`);
        
        try {
            const bitailsResponse = await fetch(bitailsUrl);
            if (bitailsResponse.ok) {
                console.log('Successfully retrieved content from bitails.io API');
                return bitailsUrl;
            }
            console.log(`bitails.io API returned status ${bitailsResponse.status}`);
        } catch (error) {
            console.log(`Error accessing bitails.io API: ${error}`);
        }

        // Try 1sat ordinals API as a last resort
        const ordUrl = `https://1satordinals.com/api/inscription/${txid}i${outputIndex}`;
        console.log(`Trying 1sat ordinals API URL: ${ordUrl}`);
        
        try {
            const ordResponse = await fetch(ordUrl);
            if (ordResponse.ok) {
                console.log('Successfully retrieved content from 1sat ordinals API');
                return ordUrl;
            }
            console.log(`1sat ordinals API returned status ${ordResponse.status}`);
        } catch (error) {
            console.log(`Error accessing 1sat ordinals API: ${error}`);
        }

        // Try to get the raw transaction data as a last resort
        const rawTxUrl = `https://api.whatsonchain.com/v1/bsv/${this.network === 'testnet' ? 'test' : 'main'}/tx/${txid}/raw`;
        console.log(`Trying to get raw transaction data from: ${rawTxUrl}`);
        
        try {
            const rawTxResponse = await fetch(rawTxUrl);
            if (rawTxResponse.ok) {
                console.log('Successfully retrieved raw transaction data');
                return rawTxUrl;
            }
            console.log(`Failed to get raw transaction data: ${rawTxResponse.status}`);
        } catch (error) {
            console.log(`Error getting raw transaction data: ${error}`);
        }

        console.log('Failed to retrieve content from all APIs');
        return undefined;
    }
} 