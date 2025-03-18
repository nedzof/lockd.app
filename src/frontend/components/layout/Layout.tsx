import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiLock, FiLogOut, FiExternalLink, FiBarChart2 } from 'react-icons/fi';
import { formatBSV, formatAddress } from '../../utils/formatBSV';
import SearchBar from '../SearchBar';

interface LayoutProps {
  children: React.ReactNode;
  connected: boolean;
  bsvAddress: string | null;
  balance: number;
  onConnect: () => void;
  onDisconnect: () => void;
  isWalletDetected: boolean;
}

export default function Layout({
  children,
  connected,
  bsvAddress,
  balance,
  onConnect,
  onDisconnect,
  isWalletDetected,
}: LayoutProps) {
  console.log('Layout render state:', { connected, bsvAddress, balance, isWalletDetected });
  
  const location = useLocation();
  
  const displayAddress = React.useMemo(() => {
    if (!connected || !bsvAddress) return null;
    return formatAddress(bsvAddress);
  }, [connected, bsvAddress]);

  const handleWalletAction = async () => {
    if (!isWalletDetected) {
      console.log('Wallet not detected, opening yours.org');
      window.open('https://yours.org', '_blank');
      return;
    }
    
    try {
      console.log('Attempting wallet connection...');
      await onConnect();
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  // Function to determine if a link is active
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[#1A1B23] text-white">
      {/* Header */}
      <header className="border-b border-gray-800/40 backdrop-blur-xl bg-[#1A1B23]/90 sticky top-0 z-50 shadow-lg shadow-black/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link 
                to="/" 
                className="flex items-center group"
              >
                <div className="flex items-center space-x-2 transition-all duration-300 group-hover:scale-105">
                  <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all duration-500 group-hover:filter group-hover:drop-shadow-[0_0_8px_rgba(0,255,163,0.6)]">
                    {/* Main lock body */}
                    <rect x="96" y="192" width="320" height="256" rx="32" fill="url(#gradient)" className="transition-all duration-500 group-hover:fill-[#00ffa3]" />
                    
                    {/* Lock shackle */}
                    <path d="M144 192V128C144 74.9807 186.981 32 240 32H272C325.019 32 368 74.9807 368 128V192" stroke="url(#gradient)" strokeWidth="48" strokeLinecap="round" className="transition-all duration-500 group-hover:stroke-[#00ffa3]"/>
                    
                    {/* Keyhole */}
                    <circle cx="256" cy="304" r="32" fill="#1A1B23"/>
                    <path d="M256 304L256 368" stroke="#1A1B23" strokeWidth="24" strokeLinecap="round"/>
                    
                    {/* Gradient definition */}
                    <defs>
                      <linearGradient id="gradient" x1="96" y1="192" x2="416" y2="448" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#00ffa3"/>
                        <stop offset="1" stopColor="#00ff9d"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-white font-bold text-xl tracking-tight">
                    <span className="text-[#00ffa3] transition-all duration-300 group-hover:text-white">Lockd</span><span className="text-gray-400 transition-all duration-300 group-hover:text-[#00ffa3]">.app</span>
                  </span>
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-1">
              <Link
                to="/posts"
                className={`px-3 py-2 rounded-lg flex items-center space-x-1 transition-all duration-300 ${
                  isActive('/posts') 
                    ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FiLock className={`${isActive('/posts') ? 'text-[#00ffa3]' : ''}`} />
                <span className="hidden sm:inline text-sm font-medium">Posts</span>
              </Link>
              
              <Link
                to="/stats"
                className={`px-3 py-2 rounded-lg flex items-center space-x-1 transition-all duration-300 ${
                  isActive('/stats') 
                    ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FiBarChart2 className={`${isActive('/stats') ? 'text-[#00ffa3]' : ''}`} />
                <span className="hidden sm:inline text-sm font-medium">Stats</span>
              </Link>
              
              {/* Search button */}
              <div className="px-3 py-2 rounded-lg">
                <SearchBar />
              </div>
            </nav>

            {/* Wallet Section */}
            <div className="flex-shrink-0">
              {connected ? (
                <div className="flex items-center space-x-2">
                  {/* Address Display */}
                  <div className="group relative">
                    <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#00ffa3]/20 bg-[#00ffa3]/5 backdrop-blur-xl transition-all duration-300 hover:border-[#00ffa3]/30 hover:shadow-[0_0_20px_rgba(0,255,163,0.1)]">
                      <div className="p-1 bg-[#00ffa3]/10 rounded-md group-hover:bg-[#00ffa3]/20 transition-all duration-300">
                        <FiLock className="text-[#00ffa3] w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300" />
                      </div>
                      {displayAddress && (
                        <span className="text-[#00ffa3] text-sm font-medium">{displayAddress}</span>
                      )}
                    </div>
                  </div>

                  {/* Disconnect Button */}
                  <button
                    onClick={onDisconnect}
                    className="group relative flex items-center space-x-1 px-3 py-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-300"
                  >
                    <FiLogOut className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform duration-300" />
                    <span className="text-sm">Disconnect</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleWalletAction}
                  className="group relative px-4 py-1.5 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-lg transition-all duration-300"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                  <div className="relative flex items-center space-x-1 text-black">
                    <span className="text-sm">{isWalletDetected ? 'Connect Wallet' : 'Download Wallet'}</span>
                    <FiExternalLink className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform duration-300" />
                  </div>
                  <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-lg"></div>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <main className="w-full">
          {children}
        </main>
      </div>
    </div>
  );
}