import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './frontend/pages/App';
import './index.css';
import { WalletProvider } from './frontend/providers/WalletProvider';

// Create a root component to properly organize providers
const Root = () => {
  return (
    <React.StrictMode>
      <WalletProvider>
        <App />
      </WalletProvider>
    </React.StrictMode>
  );
};

// Mount the application
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(<Root />); 