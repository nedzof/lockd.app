import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Home from './Home';
import WTF from './WTF';
import { useWallet } from '../providers/WalletProvider';

export default function App() {
  const { connect, disconnect, isConnected, bsvAddress, balance, isWalletDetected } = useWallet();

  return (
    <Router>
      <Layout
        connected={isConnected}
        bsvAddress={bsvAddress}
        balance={balance || 0}
        onConnect={connect}
        onDisconnect={disconnect}
        isWalletDetected={isWalletDetected}
      >
        <Routes>
          {/* Redirect root to /posts */}
          <Route path="/" element={<Navigate to="/posts" replace />} />
          
          {/* Main routes */}
          <Route path="/posts" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          <Route path="/stats" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          <Route path="/settings" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          <Route path="/wtf" element={<WTF />} />
          
          {/* Catch all route - redirect to /posts */}
          <Route path="*" element={<Navigate to="/posts" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
} 