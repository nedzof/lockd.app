/**
 * Parses MAP protocol data from transaction outputs
 */
export function parseMapData(data: string[]): Record<string, any>[] {
    const results: Record<string, any>[] = [];
    
    for (const item of data) {
        try {
            // Check if the item is a MAP protocol command
            if (item.startsWith('app=') || item.startsWith('type=')) {
                // Initialize MAP data object
                const mapData: Record<string, any> = {};
                
                // Split command and value
                const [key, value] = item.split('=');
                mapData[key.toLowerCase()] = value;

                // Add to results if it's a new MAP entry
                if (key === 'app') {
                    results.push(mapData);
                }
                // Add to the last MAP entry if it exists
                else if (results.length > 0) {
                    results[results.length - 1][key.toLowerCase()] = value;
                }
            }
            // If it's a hex string, try to parse it as OP_RETURN data
            else if (/^[0-9a-fA-F]+$/.test(item)) {
                const opReturnData = Buffer.from(item, 'hex').toString();
                console.log('Extracted OP_RETURN data:', opReturnData);

                // Initialize MAP data object
                const mapData: Record<string, any> = {};
                
                // Split by MAP protocol delimiters
                const parts = opReturnData.split('|');
                for (const part of parts) {
                    const [key, value] = part.split('=').map(s => s.trim());
                    if (key && value) {
                        // Convert known numeric fields
                        if (key === 'lockAmount' || key === 'lockDuration') {
                            mapData[key] = parseInt(value);
                        }
                        // Parse JSON fields
                        else if (key === 'tags' || key === 'options') {
                            try {
                                mapData[key] = JSON.parse(value);
                            } catch {
                                mapData[key] = value;
                            }
                        }
                        // Store other fields as is
                        else {
                            mapData[key] = value;
                        }
                    }
                }
                
                if (Object.keys(mapData).length > 0) {
                    console.log('Parsed MAP data:', mapData);
                    results.push(mapData);
                }
            }
        } catch (error) {
            console.error('Error parsing MAP data:', {
                error: error instanceof Error ? error.message : error,
                data: item.substring(0, 100) + '...'
            });
        }
    }
    
    return results;
} 