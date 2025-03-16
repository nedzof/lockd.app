import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { YoursProvider } from 'yours-wallet-provider';
import App from './frontend/pages/App';
import { WalletProvider } from './frontend/providers/WalletProvider';
import './index.css';

// Create a root component to properly organize providers
const Root = () => {
  return (
    <React.StrictMode>
      <YoursProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </YoursProvider>
    </React.StrictMode>
  );
};

// Mount the application
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(<Root />); 