import type { useYoursWallet } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

/**
 * Helper function to retrieve BSV address from wallet with multiple fallback mechanisms
 * @param wallet The wallet instance
 * @returns The BSV address if found, otherwise null
 */
export const getBsvAddress = async (wallet: YoursWallet): Promise<string | null> => {
  if (!wallet) {
    console.error('No wallet provided to getBsvAddress');
    return null;
  }

  console.log('Attempting to get BSV address with fallbacks...');
  
  // Try direct bsvAddress property
  let bsvAddress = wallet.bsvAddress;
  if (bsvAddress) {
    console.log('Found address in wallet.bsvAddress:', bsvAddress);
    return bsvAddress;
  }
  
  // Try getAddresses method
  if (typeof wallet.getAddresses === 'function') {
    try {
      console.log('Trying wallet.getAddresses()...');
      const addresses = await wallet.getAddresses();
      console.log('getAddresses returned:', addresses);
      
      if (addresses && typeof addresses === 'object') {
        // Handle case where getAddresses returns an object with bsvAddress property
        if (addresses.bsvAddress) {
          bsvAddress = addresses.bsvAddress;
          console.log('Using bsvAddress from getAddresses object:', bsvAddress);
          return bsvAddress;
        }
        // Handle case where getAddresses returns an array
        else if (Array.isArray(addresses) && addresses.length > 0) {
          bsvAddress = addresses[0];
          console.log('Using first address from getAddresses array:', bsvAddress);
          return bsvAddress;
        }
      }
    } catch (error) {
      console.error('Error getting addresses:', error);
    }
  }
  
  // Try getAddress method (singular)
  if (typeof wallet.getAddress === 'function') {
    try {
      console.log('Trying wallet.getAddress()...');
      const address = await wallet.getAddress();
      console.log('getAddress returned:', address);
      if (address) {
        bsvAddress = address;
        console.log('Using address from getAddress:', bsvAddress);
        return bsvAddress;
      }
    } catch (error) {
      console.error('Error calling getAddress():', error);
    }
  }
  
  // Try to extract from wallet object properties
  console.log('Searching wallet object for address properties...');
  // Look for common address property names
  const possibleAddressProps = ['address', 'walletAddress', 'paymentAddress', 'receivingAddress'];
  for (const prop of possibleAddressProps) {
    if (wallet[prop] && typeof wallet[prop] === 'string') {
      bsvAddress = wallet[prop];
      console.log(`Found address in wallet.${prop}:`, bsvAddress);
      return bsvAddress;
    }
  }
  
  // If we still don't have an address, return null
  console.warn('No BSV address found after trying all fallback methods');
  return null;
};

/**
 * Helper function to ensure wallet connection with retry mechanism
 * @param wallet The wallet instance
 * @param connect The connect function from wallet context
 * @param maxRetries Maximum number of retries (default: 2)
 * @returns Object containing success status and address if successful
 */
export const ensureWalletConnection = async (
  wallet: YoursWallet,
  connect: () => Promise<void>,
  maxRetries = 2
): Promise<{ success: boolean; address: string | null }> => {
  if (!wallet) {
    console.error('No wallet provided to ensureWalletConnection');
    return { success: false, address: null };
  }

  // Check if wallet is ready
  if (!wallet.isReady) {
    console.log('Wallet is not ready');
    toast.error('Wallet is not ready. Please install or unlock your wallet extension.');
    return { success: false, address: null };
  }

  // Check if we already have an address
  let address = await getBsvAddress(wallet);
  if (address) {
    console.log('Already have wallet address:', address);
    return { success: true, address };
  }

  // Try to connect
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`Connection attempt ${retries + 1}/${maxRetries}...`);
      await connect();
      
      // Check if we have an address after connecting
      address = await getBsvAddress(wallet);
      if (address) {
        console.log('Successfully got address after connection:', address);
        return { success: true, address };
      }
      
      // Wait a moment before retrying
      console.log('No address after connection, waiting before retry...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check again after waiting
      address = await getBsvAddress(wallet);
      if (address) {
        console.log('Successfully got address after waiting:', address);
        return { success: true, address };
      }
      
      retries++;
    } catch (error) {
      console.error(`Error during connection attempt ${retries + 1}:`, error);
      retries++;
      
      // Wait longer between retries if there was an error
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error('Failed to connect wallet after multiple attempts');
  return { success: false, address: null };
};

/**
 * Helper function to validate wallet connection status
 * @param wallet The wallet instance
 * @returns True if wallet is connected, false otherwise
 */
export const isWalletConnected = async (wallet?: YoursWallet): Promise<boolean> => {
  if (!wallet) {
    console.log('No wallet provided to isWalletConnected, using window.yours');
    wallet = window.yours;
    if (!wallet) {
      console.warn('No wallet available in window.yours');
      return false;
    }
  }

  try {
    // Check if wallet has an address
    const address = await getBsvAddress(wallet);
    if (!address) {
      console.warn('Wallet has no address, considering as not connected');
      return false;
    }

    // Additional checks could be added here
    // For example, checking if wallet has a balance, or if it's ready

    return true;
  } catch (error) {
    console.error('Error checking wallet connection:', error);
    return false;
  }
};

/**
 * Helper function to display wallet connection status with detailed information
 * @param wallet The wallet instance
 * @returns Detailed wallet status object
 */
export const getWalletStatus = async (wallet?: YoursWallet): Promise<{
  isReady: boolean;
  isConnected: boolean;
  hasAddress: boolean;
  address: string | null;
  hasBalance: boolean;
  balance?: { bsv?: number; satoshis?: number };
}> => {
  if (!wallet) {
    console.log('No wallet provided to getWalletStatus, using window.yours');
    wallet = window.yours;
    if (!wallet) {
      console.warn('No wallet available in window.yours');
      return {
        isReady: false,
        isConnected: false,
        hasAddress: false,
        address: null,
        hasBalance: false
      };
    }
  }

  const isReady = !!wallet.isReady;
  const isConnected = await isWalletConnected(wallet);
  const address = await getBsvAddress(wallet);
  
  let balance;
  let hasBalance = false;
  
  if (address && typeof wallet.getBalance === 'function') {
    try {
      balance = await wallet.getBalance();
      hasBalance = true;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
    }
  }
  
  return {
    isReady,
    isConnected,
    hasAddress: !!address,
    address,
    hasBalance,
    balance
  };
};
