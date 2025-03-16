import { API_URL } from "../../config";
import * as React from 'react';
import { SiBitcoinsv } from 'react-icons/si';
import { FiX } from 'react-icons/fi';
import { LockLike } from '../types';
import { DEFAULT_LOCKLIKE_AMOUNT } from '../types';
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

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid amount');
      }

      if (parsedAmount > balance.bsv) {
        throw new Error('Amount exceeds available balance');
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

      const nLockTime = currentblock_height + 1; // Lock for 1 block

      // Create the lock transaction
      const lockResponse = await wallet.lockBsv([{
        address: addresses.identityAddress,
        block_height: nLockTime,
        sats: parsedAmount * SATS_PER_BSV,
      }]);

      if (!lockResponse) {
        throw new Error('Failed to create lock transaction');
      }

      // Create the lock like record
      const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: posttx_id || replytx_id,
          author_address: addresses.identityAddress,
          amount: parsedAmount * SATS_PER_BSV,
          lock_duration: nLockTime,
          tx_id: lockResponse.tx_id,
        }),
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.json();
        throw new Error(error.message || 'Error creating lock like');
      }

      toast.success('Successfully locked BSV!');
      setShowInput(false);
      setAmount(DEFAULT_LOCKLIKE_AMOUNT.toString());
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
                        <FiX className="h-6 w-6" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Lock BSV
                      </h3>
                      
                      <div className="space-y-6">
                        <div>
                          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Amount (BSV)
                          </label>
                          <input
                            type="number"
                            value={amount}
                            onChange={handleAmountChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleLockLike();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setShowInput(false);
                              }
                            }}
                            onWheel={(e) => {
                              // Instead of preventing default (which causes the error),
                              // we handle the wheel event directly
                              const delta = e.deltaY > 0 ? -1 : 1;
                              const currentSats = Math.floor(parseFloat(amount) * SATS_PER_BSV);
                              const newSats = Math.max(MIN_SATS, currentSats + delta);
                              setAmount((newSats / SATS_PER_BSV).toString());
                              // Keep focus on the input
                              e.currentTarget.focus();
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500 bg-white dark:bg-gray-900 text-lg py-3 px-4"
                            placeholder="0.00000000"
                            min="0"
                            max={balance.bsv}
                            step={1 / SATS_PER_BSV}
                          />
                          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                            Available balance: {balance.bsv.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 8
                            })} BSV
                          </p>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Locks for 1 block (≈ 10 minutes)
                          </p>
                        </div>
                        <button
                          onClick={handleLockLike}
                          className="w-full px-6 py-3 text-base font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors duration-200"
                        >
                          Lock BSV
                        </button>
                      </div>
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