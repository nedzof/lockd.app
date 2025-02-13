/**
 * Parses MAP protocol data from transaction outputs
 */
export function parseMapData(data: string[]): Record<string, any>[] {
    const results: Record<string, any>[] = [];
    
    for (const item of data) {
        try {
            // Initialize MAP data object
            const mapData: Record<string, any> = {};
            
            // Check if the item is a hex string that might contain image data
            if (/^[0-9a-fA-F]+$/.test(item)) {
                const buffer = Buffer.from(item, 'hex');
                const content = buffer.toString('utf8');

                // Check for base64 image patterns
                const jpegPattern = /\/9j\/([A-Za-z0-9+/=]+)/;
                const pngPattern = /iVBORw0KGg([A-Za-z0-9+/=]+)/;
                const dataUrlPattern = /data:image\/(jpeg|png|gif);base64,([A-Za-z0-9+/=]+)/;

                let imageData = null;
                let imageType = null;

                if (dataUrlPattern.test(content)) {
                    const match = content.match(dataUrlPattern);
                    if (match) {
                        imageData = match[2];
                        imageType = `image/${match[1]}`;
                    }
                } else if (jpegPattern.test(content)) {
                    const match = content.match(jpegPattern);
                    if (match) {
                        imageData = '/9j/' + match[1];
                        imageType = 'image/jpeg';
                    }
                } else if (pngPattern.test(content)) {
                    const match = content.match(pngPattern);
                    if (match) {
                        imageData = 'iVBORw0KGg' + match[1];
                        imageType = 'image/png';
                    }
                }

                if (imageData) {
                    mapData.raw_image_data = imageData;
                    mapData.media_type = imageType;
                }

                // Parse MAP protocol data
                const parts = content.split('|');
                for (const part of parts) {
                    const [key, value] = part.split('=').map(s => s.trim());
                    if (key && value) {
                        // Handle base64 encoded content
                        if (key === 'content' && value.startsWith('base64:')) {
                            try {
                                mapData[key] = Buffer.from(value.substring(7), 'base64').toString();
                            } catch {
                                mapData[key] = value;
                            }
                        }
                        // Parse vote-related fields
                        else if (key === 'isVoteQuestion' || key === 'isVote') {
                            mapData.is_vote = value.toLowerCase() === 'true';
                        }
                        else if (key === 'voteOptions' || key === 'options') {
                            try {
                                const options = JSON.parse(value);
                                mapData.vote_options = Array.isArray(options) ? options : [options];
                                mapData.vote_options = mapData.vote_options.map((opt: any) => ({
                                    content: opt.content || opt.text || opt.optionText,
                                    lock_amount: parseInt(opt.lockAmount || opt.lock_amount) || 1000,
                                    lock_duration: parseInt(opt.lockDuration || opt.lock_duration) || 144,
                                    questionTxid: opt.questionTxid
                                }));
                                mapData.is_vote = true;
                            } catch (e) {
                                console.error('Error parsing vote options:', e);
                            }
                        }
                        // Convert known numeric fields
                        else if (key === 'lockAmount' || key === 'lockDuration') {
                            mapData[key] = parseInt(value);
                        }
                        // Parse JSON fields
                        else if (key === 'tags') {
                            try {
                                mapData[key] = JSON.parse(value);
                            } catch {
                                mapData[key] = value.split(',').map(t => t.trim());
                            }
                        }
                        // Store other fields as is
                        else {
                            mapData[key] = value;
                        }
                    }
                }
            }
            // Handle MAP protocol commands
            else if (item.startsWith('app=') || item.startsWith('type=')) {
                const [key, value] = item.split('=');
                mapData[key.toLowerCase()] = value;
            }

            if (Object.keys(mapData).length > 0) {
                console.log('Parsed MAP data:', mapData);
                results.push(mapData);
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