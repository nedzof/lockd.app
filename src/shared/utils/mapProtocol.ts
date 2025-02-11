/**
 * Parses MAP protocol data from transaction outputs
 */
export function parseMapData(data: string[]): Record<string, any>[] {
    const results: Record<string, any>[] = [];
    
    for (const hex of data) {
        try {
            // Extract OP_RETURN data from hex
            const opReturnMatch = hex.match(/6a([0-9a-fA-F]*)/);
            if (!opReturnMatch) continue;
            
            const opReturnData = Buffer.from(opReturnMatch[1], 'hex').toString();
            const mapData: Record<string, any> = {};
            
            // Split by MAP protocol delimiters
            const parts = opReturnData.split('|');
            for (const part of parts) {
                const [key, value] = part.split('=');
                if (key && value) {
                    mapData[key] = value;
                }
            }
            
            if (Object.keys(mapData).length > 0) {
                results.push(mapData);
            }
        } catch (error) {
            console.error('Error parsing MAP data:', error);
        }
    }
    
    return results;
} 