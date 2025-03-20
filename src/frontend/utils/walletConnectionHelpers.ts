import { useYoursWallet } from 'yours-wallet-provider';

type YoursWallet = ReturnType<typeof useYoursWallet>;

/**
 * Helper function to retrieve BSV address from wallet
 * @param wallet The wallet instance
 * @returns The BSV address if found, otherwise null
 */
export const getBsvAddress = async (wallet: YoursWallet): Promise<string | null> => {
  if (!wallet) {
    console.error('No wallet provided to getBsvAddress');
    return null;
  }

  try {
    const addresses = await wallet.getAddresses();
    if (addresses && typeof addresses === 'object' && 'bsvAddress' in addresses) {
      return addresses.bsvAddress;
    }
    return null;
  } catch (error) {
    console.error('Error getting BSV address:', error);
    return null;
  }
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
    return false;
  }

  try {
    return wallet.isConnected ? await wallet.isConnected() : false;
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
    // Return a default response instead of trying to use window.yours
    return {
      isReady: false,
      isConnected: false,
      hasAddress: false,
      address: null,
      hasBalance: false
    };
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

/**
 * Helper function to detect if the Yours wallet is installed
 * @returns True if wallet is installed, false otherwise
 */
export const isWalletInstalled = (): boolean => {
  return 'yours' in window && !!window.yours?.isReady;
};
