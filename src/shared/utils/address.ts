import { bsv } from 'scrypt-ts';

// BSV address validation regex for different formats
const BSV_ADDRESS_REGEX = {
    mainnet: {
        p2pkh: /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
        p2sh: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/
    },
    testnet: {
        p2pkh: /^[mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
        p2sh: /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/
    }
};

/**
 * Validates a BSV address format and checksum
 * @param address The BSV address to validate
 * @param isTestnet Whether to validate against testnet format
 * @returns boolean indicating if the address is valid
 */
export function validateBsvAddress(address: string, isTestnet: boolean = false): boolean {
    if (!address) return false;

    try {
        // Check basic format using regex
        const network = isTestnet ? BSV_ADDRESS_REGEX.testnet : BSV_ADDRESS_REGEX.mainnet;
        const isValidFormat = Object.values(network).some(regex => regex.test(address));
        if (!isValidFormat) return false;

        // Validate address structure and checksum using bsv library
        try {
            const bsvAddress = bsv.Address.fromString(address);
            return bsvAddress.isValid() && bsvAddress.isMainnet() === !isTestnet;
        } catch {
            return false;
        }
    } catch {
        return false;
    }
}

/**
 * Checks if a public key hash is valid
 * @param pkhash The public key hash to validate
 * @returns boolean indicating if the public key hash is valid
 */
export function validatePublicKeyHash(pkhash: string): boolean {
    if (!pkhash) return false;
    
    // Public key hash should be 20 bytes (40 hex characters)
    if (!/^[a-fA-F0-9]{40}$/.test(pkhash)) return false;
    
    return true;
}

/**
 * Checks if a public key is valid
 * @param pubkey The public key to validate
 * @returns boolean indicating if the public key is valid
 */
export function validatePublicKey(pubkey: string): boolean {
    if (!pubkey) return false;
    
    try {
        // Attempt to create a public key object
        const key = bsv.PublicKey.fromString(pubkey);
        return key.isValid();
    } catch {
        return false;
    }
}

/**
 * Validates transaction ID format
 * @param txid The transaction ID to validate
 * @returns boolean indicating if the transaction ID is valid
 */
export function validateTxId(txid: string): boolean {
    if (!txid) return false;
    
    // Transaction ID should be 32 bytes (64 hex characters)
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) return false;
    
    return true;
} 