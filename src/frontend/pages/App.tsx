import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, createRoutesFromElements, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import Home from './Home';
import Stats from './Stats';
import { useWallet } from '../providers/WalletProvider';

// Create a component to handle search redirects
function SearchRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  
  React.useEffect(() => {
    // Navigate to the home page with the search query parameters
    navigate({
      pathname: '/',
      search: location.search
    });
  }, [navigate, location.search]);
  
  return null;
}

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
          {/* Home route directly on root path */}
          <Route path="/" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          
          {/* Main routes */}
          <Route path="/posts" element={<Home connected={isConnected} bsvAddress={bsvAddress} />} />
          <Route path="/stats" element={<Stats />} />
          
          {/* Redirect search page to home with search parameters */}
          <Route path="/search" element={<SearchRedirect />} />
          
          {/* Catch all route - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="bottom-right" />
    </Router>
  );
}