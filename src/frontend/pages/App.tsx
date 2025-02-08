import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Home from './Home';
import WTF from './WTF';

interface WalletAddresses {
  bsvAddress: string;
}

export default function App() {
  const [wallet, setWallet] = React.useState<Window['yours']>();
  const [connected, setConnected] = React.useState(false);
  const [bsvAddress, setBsvAddress] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<number>(0);

  // Initialize wallet when component mounts
  React.useEffect(() => {
    if (window.yours) {
      setWallet(window.yours);
    }
  }, []);

  // Check wallet connection status
  React.useEffect(() => {
    const checkConnection = async () => {
      if (wallet?.isReady) {
        const isConnected = await wallet.isConnected();
        setConnected(isConnected);
        if (isConnected) {
          const addresses = await wallet.getAddresses();
          if (addresses?.bsvAddress) {
            setBsvAddress(addresses.bsvAddress);
            const bal = await wallet.getBalance();
            setBalance(Number(bal));
          }
        }
      }
    };

    if (wallet) {
      checkConnection();
    }
  }, [wallet]);

  const connect = async () => {
    if (wallet?.isReady) {
      try {
        await wallet.connect();
        const isConnected = await wallet.isConnected();
        setConnected(isConnected);
        if (isConnected) {
          const addresses = await wallet.getAddresses();
          if (addresses?.bsvAddress) {
            setBsvAddress(addresses.bsvAddress);
            const bal = await wallet.getBalance();
            setBalance(Number(bal));
          }
        }
      } catch (error) {
        console.error('Failed to connect:', error);
      }
    } else {
      window.open('https://yours.org', '_blank');
    }
  };

  const disconnect = async () => {
    if (wallet?.isReady) {
      try {
        await wallet.disconnect();
        setConnected(false);
        setBsvAddress(null);
        setBalance(0);
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }
  };

  // Set up wallet event listeners
  React.useEffect(() => {
    if (!wallet?.on) return;

    const handleSwitchAccount = async () => {
      const addresses = await wallet.getAddresses();
      if (addresses?.bsvAddress) {
        setBsvAddress(addresses.bsvAddress);
        const bal = await wallet.getBalance();
        setBalance(Number(bal));
      }
    };

    const handleSignedOut = () => {
      setConnected(false);
      setBsvAddress(null);
      setBalance(0);
    };

    wallet.on('switchAccount', handleSwitchAccount);
    wallet.on('signedOut', handleSignedOut);

    return () => {
      if (wallet?.off) {
        wallet.off('switchAccount', handleSwitchAccount);
        wallet.off('signedOut', handleSignedOut);
      }
    };
  }, [wallet]);

  return (
    <Router>
      <Layout
        connected={connected}
        bsvAddress={bsvAddress}
        balance={balance}
        onConnect={connect}
        onDisconnect={disconnect}
      >
        <Routes>
          {/* Redirect root to /posts */}
          <Route path="/" element={<Navigate to="/posts" replace />} />
          
          {/* Main routes */}
          <Route path="/posts" element={<Home connected={connected} bsvAddress={bsvAddress} />} />
          <Route path="/stats" element={<Home connected={connected} bsvAddress={bsvAddress} />} />
          <Route path="/settings" element={<Home connected={connected} bsvAddress={bsvAddress} />} />
          <Route path="/wtf" element={<WTF />} />
          
          {/* Catch all route - redirect to /posts */}
          <Route path="*" element={<Navigate to="/posts" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
} 