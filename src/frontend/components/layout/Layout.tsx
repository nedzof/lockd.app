import * as React from 'react';
import { Link } from 'react-router-dom';
import { FiLock, FiLogOut, FiExternalLink } from 'react-icons/fi';
import { formatBSV, formatAddress } from '../../utils/formatBSV';

interface LayoutProps {
  children: React.ReactNode;
  connected: boolean;
  bsvAddress: string | null;
  balance: number;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Layout({
  children,
  connected,
  bsvAddress,
  balance,
  onConnect,
  onDisconnect,
}: LayoutProps) {
  console.log('Layout render state:', { connected, bsvAddress, balance });
  
  const displayAddress = React.useMemo(() => {
    if (!connected || !bsvAddress) return null;
    return formatAddress(bsvAddress);
  }, [connected, bsvAddress]);

  return (
    <div className="min-h-screen bg-[#1A1B23] text-white">
      {/* Header */}
      <header className="border-b border-gray-800/30 backdrop-blur-xl bg-gradient-to-r from-[#1A1B23]/95 via-[#2A2A40]/95 to-[#1A1B23]/95 sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link 
                to="/" 
                className="flex items-center"
              >
                <img
                  src="/logo.png"
                  alt="Lockd.app"
                  className="h-8 w-auto"
                />
              </Link>
            </div>

            {/* Centered Navigation Links */}
            <div className="flex-1 flex justify-center">
              <nav className="flex items-center space-x-6">
                <Link
                  to="/posts"
                  className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                >
                  Posts
                </Link>
                <Link
                  to="/stats"
                  className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                >
                  Stats
                </Link>
                <Link
                  to="/settings"
                  className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                >
                  Notifications
                </Link>
                <Link
                  to="/wtf"
                  className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                >
                  WTF is Lockd.app?
                </Link>
              </nav>
            </div>

            {/* Wallet Section */}
            <div className="flex-shrink-0">
              {connected ? (
                <div className="flex items-center space-x-4">
                  {/* Address Display */}
                  <div className="group relative">
                    <div className="flex items-center space-x-3 px-4 py-2 rounded-xl border border-[#00ffa3]/20 bg-gradient-to-r from-[#2A2A40]/50 to-[#1A1B23]/50 backdrop-blur-xl transition-all duration-300 hover:border-[#00ffa3]/30 hover:shadow-[0_0_20px_rgba(0,255,163,0.1)]">
                      <div className="p-1.5 bg-[#00ffa3] bg-opacity-10 rounded-lg group-hover:bg-opacity-20 transition-all duration-300">
                        <FiLock className="text-[#00ffa3] w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                      </div>
                      {displayAddress && (
                        <span className="text-[#00ffa3] font-medium">{displayAddress}</span>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-5 blur-xl transition-all duration-300 rounded-xl"></div>
                  </div>

                  {/* Disconnect Button */}
                  <button
                    onClick={onDisconnect}
                    className="group relative flex items-center space-x-2 px-4 py-2 text-gray-400 hover:text-white transition-all duration-300"
                  >
                    <FiLogOut className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                    <span>Disconnect</span>
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 rounded-lg transition-all duration-300"></div>
                  </button>
                </div>
              ) : (
                <button
                  onClick={onConnect}
                  className="group relative px-6 py-2 rounded-xl font-medium transition-all duration-300 transform hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl transition-all duration-300"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                  <div className="relative flex items-center space-x-2 text-black">
                    <span>Connect Wallet</span>
                    <FiExternalLink className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
                  </div>
                  <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <main className="w-full">
          {children}
        </main>
      </div>
    </div>
  );
} 