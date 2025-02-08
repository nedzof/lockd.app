import { bsv } from 'scrypt-ts';

/**
 * Validates a BSV address
 */
export function validateBsvAddress(address: string, isTestnet: boolean = false): boolean {
  try {
    // Check basic format
    if (!address || typeof address !== 'string') {
      return false;
    }

    // Check network prefix
    const network = isTestnet ? bsv.Networks.testnet : bsv.Networks.mainnet;
    const prefix = address.charAt(0);
    if (network === bsv.Networks.testnet && !['m', 'n', '2'].includes(prefix)) {
      return false;
    }
    if (network === bsv.Networks.mainnet && !['1', '3'].includes(prefix)) {
      return false;
    }

    // Validate address format
    return bsv.Address.isValid(address, network);
  } catch {
    return false;
  }
}

/**
 * Validates a public key
 */
export function validatePublicKey(publicKey: string): boolean {
  try {
    if (!publicKey || typeof publicKey !== 'string') {
      return false;
    }

    // Check if it's a valid hex string
    if (!/^[0-9a-fA-F]{66}$/.test(publicKey)) {
      return false;
    }

    // Validate public key format
    return bsv.PublicKey.isValid(publicKey);
  } catch {
    return false;
  }
}

/**
 * Validates an amount in satoshis
 */
export function validateAmount(amount: number): boolean {
  return (
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount > 0 &&
    amount <= 21e14 // Max BSV supply in satoshis
  );
}

/**
 * Validates a block height
 */
export function validateBlockHeight(height: number): boolean {
  return (
    typeof height === 'number' &&
    Number.isInteger(height) &&
    height >= 0
  );
} 