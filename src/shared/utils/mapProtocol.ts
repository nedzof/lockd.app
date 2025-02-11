/**
 * Parses MAP protocol data from transaction outputs
 */
export function parseMapData(data: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const item of data) {
        const [key, value] = item.split('=');
        if (key && value) {
            result[key] = value;
        }
    }
    return result;
} 