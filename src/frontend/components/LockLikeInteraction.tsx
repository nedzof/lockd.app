import { API_URL } from "../config";
import * as React from 'react';
import { SiBitcoinsv } from 'react-icons/si';
import { FiX } from 'react-icons/fi';
import { LockLike } from '../types';
import { DEFAULT_LOCKLIKE_AMOUNT, DEFAULT_LOCKLIKE_BLOCKS } from '../types';
import { useWallet } from '../providers/WalletProvider';
import { toast } from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';
import { createPortal } from 'react-dom';


interface LockLikeInteractionProps {
  posttx_id?: string;
  replytx_id?: string;
  postLockLike: (
    tx_id: string,
    amount: number,
    nLockTime: number,
    handle: string,
    posttx_id?: string,
    replytx_id?: string
  ) => Promise<LockLike>;
}

const SATS_PER_BSV = 100000000;
const MIN_SATS = 1;

export default function LockLikeInteraction({ posttx_id, replytx_id, postLockLike }: LockLikeInteractionProps) {
  const { wallet, connect, isConnected, isWalletDetected, balance, refreshBalance } = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [showInput, setShowInput] = React.useState(false);
  const [amount, setAmount] = React.useState(DEFAULT_LOCKLIKE_AMOUNT.toString());
  const [lockDuration, setLockDuration] = React.useState(DEFAULT_LOCKLIKE_BLOCKS.toString());

  // Handle escape key press and body scroll lock
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showInput) {
        setShowInput(false);
      }
    };

    if (showInput) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      // Restore body scrolling when modal is closed
      document.body.style.overflow = 'unset';
    };
  }, [showInput]);

  // Fetch wallet balance when showing input
  React.useEffect(() => {
    if (showInput && isConnected) {
      refreshBalance();
    }
  }, [showInput, isConnected, refreshBalance]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const parsedValue = parseFloat(newValue);
    
    // Don't allow negative numbers
    if (parsedValue < 0) {
      setAmount('0');
      return;
    }

    // Don't allow more than max balance
    if (parsedValue > balance.bsv) {
      setAmount(balance.bsv.toString());
      return;
    }

    // Ensure we have at least 1 sat
    if (parsedValue * SATS_PER_BSV < MIN_SATS && parsedValue !== 0) {
      setAmount((MIN_SATS / SATS_PER_BSV).toString());
      return;
    }

    setAmount(newValue);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const parsedValue = parseInt(newValue, 10);
    
    // Don't allow negative numbers
    if (parsedValue < 0) {
      setLockDuration('1');
      return;
    }

    // Don't allow less than 1 block
    if (parsedValue < 1) {
      setLockDuration('1');
      return;
    }

    // Cap at 52560 blocks (approximately 1 year)
    if (parsedValue > 52560) {
      setLockDuration('52560');
      return;
    }

    setLockDuration(newValue);
  };

  const handleLockClick = async () => {
    try {
      if (!isWalletDetected) {
        window.open('https://yours.org', '_blank');
        return;
      }

      if (!isConnected) {
        const loadingToastId = toast.loading('Connecting wallet...');
        try {
          await connect();
          toast.dismiss(loadingToastId);
          toast.success('Wallet connected successfully!');
        } catch (error) {
          toast.dismiss(loadingToastId);
          console.error('Error connecting wallet:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to connect wallet');
          return;
        }
      }

      // Only show input after confirming wallet is connected
      setShowInput(true);
    } catch (error) {
      console.error('Error handling lock click:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleLockLike = async () => {
    if (!wallet || !isConnected) {
      toast.error('Please connect your wallet first');
      setShowInput(false);
      return;
    }

    setLoading(true);
    try {
      const parsedAmount = parseFloat(amount);
      const parsedDuration = parseInt(lockDuration, 10);

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid amount');
      }

      if (parsedAmount > balance.bsv) {
        throw new Error('Amount exceeds available balance');
      }

      if (isNaN(parsedDuration) || parsedDuration <= 0) {
        throw new Error('Invalid lock duration');
      }

      // Get the user's identity address
      const addresses = await wallet.getAddresses();
      if (!addresses?.identityAddress) {
        throw new Error('Could not get identity address');
      }

      // Get current block height from the network
      const currentblock_height = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info')
        .then(res => res.json())
        .then(data => data.blocks);

      if (!currentblock_height) {
        throw new Error('Could not get current block height');
      }

      const nLockTime = currentblock_height + parsedDuration; // Lock for specified blocks

      // Create the lock transaction using the wallet's lockBsv function
      const lockResponse = await wallet.lockBsv([{
        address: addresses.identityAddress,
        blockHeight: nLockTime,
        sats: Math.floor(parsedAmount * SATS_PER_BSV),
      }]);

      if (!lockResponse || !lockResponse.txid) {
        throw new Error('Failed to create lock transaction');
      }

      console.log('Lock transaction created:', lockResponse);

      // Create the lock like record
      const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: posttx_id || replytx_id,
          author_address: addresses.identityAddress,
          amount: Math.floor(parsedAmount * SATS_PER_BSV),
          lock_duration: parsedDuration,
          tx_id: lockResponse.txid,
        }),
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.json();
        throw new Error(error.message || 'Error creating lock like');
      }

      const responseData = await apiResponse.json();
      console.log('Lock like created:', responseData);

      toast.success(`Successfully locked ${parsedAmount} BSV for ${parsedDuration} blocks!`);
      setShowInput(false);
      setAmount(DEFAULT_LOCKLIKE_AMOUNT.toString());
      setLockDuration(DEFAULT_LOCKLIKE_BLOCKS.toString());
      
      // Refresh balance after successful lock
      refreshBalance();
    } catch (error) {
      console.error('Error locking:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-0 relative items-center" onClick={(e) => e.stopPropagation()}>
      {loading ? (
        <div role="status">
          <svg
            aria-hidden="true"
            className="inline w-4 h-4 mr-2 text-gray-200 animate-spin dark:text-gray-600 fill-orange-400"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      ) : (
        <>
          <button
            onClick={handleLockClick}
            className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400"
          >
            <SiBitcoinsv className="h-4 w-4" />
            <span>Lock</span>
          </button>

          {showInput && createPortal(
            <div className="fixed inset-0 isolate" style={{ zIndex: 999999 }}>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setShowInput(false)}
                aria-hidden="true"
              />
              
              {/* Modal container */}
              <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                  {/* Modal panel */}
                  <div 
                    className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all w-full max-w-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Close button */}
                    <div className="absolute right-0 top-0 pr-4 pt-4 z-10">
                      <button
                        type="button"
                        className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        onClick={() => setShowInput(false)}
                      >
                        <span className="sr-only">Close</span>
                        <FiX className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                    
                    {/* Modal header */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">Lock BSV</h3>
                    </div>
                    
                    {/* Modal body */}
                    <div className="px-6 py-4">
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Amount (BSV)
                          </label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <input
                              type="number"
                              name="amount"
                              id="amount"
                              className="focus:ring-orange-500 focus:border-orange-500 block w-full rounded-md sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              placeholder="0.001"
                              value={amount}
                              onChange={handleAmountChange}
                              step="0.00000001" // Allow for satoshi-level precision
                              min="0"
                              max={balance.bsv.toString()}
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Available: {balance.bsv.toFixed(8)} BSV
                          </p>
                        </div>
                        
                        <div>
                          <label htmlFor="lockDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Lock Duration (blocks)
                          </label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <input
                              type="number"
                              name="lockDuration"
                              id="lockDuration"
                              className="focus:ring-orange-500 focus:border-orange-500 block w-full rounded-md sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              placeholder={DEFAULT_LOCKLIKE_BLOCKS.toString()}
                              value={lockDuration}
                              onChange={handleDurationChange}
                              step="1"
                              min="1"
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Approximately {Math.round(parseInt(lockDuration, 10) * 10 / 60 / 24)} days
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Modal footer */}
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                        onClick={() => setShowInput(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ml-3 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                        onClick={handleLockLike}
                        disabled={loading || parseFloat(amount) <= 0}
                      >
                        Lock BSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
} 