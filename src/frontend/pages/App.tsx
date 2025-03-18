import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, createRoutesFromElements } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import Home from './Home';
import Search from './Search';
import Stats from './Stats';
import { useWallet } from '../providers/WalletProvider';

export default function App() {
  const { connect, disconnect, isConnected, bsvAddress, balance, isWalletDetected } = useWallet();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Layout
        connected={isConnected}
        bsvAddress={bsvAddress}
        balance={balance.bsv}
        onConnect={connect}
        onDisconnect={disconnect}
        isWalletDetected={isWalletDetected}
      >
        <Routes>
          {/* Redirect root to /posts */}
          <Route path="/" element={<Navigate to="/posts" replace />} />
          
          {/* Main routes */}
          <Route path="/posts" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/search" element={<Search />} />
          
          {/* Catch all route - redirect to /posts */}
          <Route path="*" element={<Navigate to="/posts" replace />} />
        </Routes>
      </Layout>
      <Toaster position="bottom-right" />
    </Router>
  );
}