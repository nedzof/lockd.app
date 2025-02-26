import * as React from 'react';
import { useEffect, useState } from 'react';
import { useYoursWallet } from 'yours-wallet-provider';

export default function WalletTest() {
  const wallet = useYoursWallet();
  const [status, setStatus] = useState<string>('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<any>(null);
  const [pubKeys, setPubKeys] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [showWalletObject, setShowWalletObject] = useState<boolean>(false);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };

  useEffect(() => {
    if (wallet) {
      addLog(`Wallet detected: isReady=${wallet.isReady}`);
      setStatus(wallet.isReady ? 'Wallet detected' : 'Wallet not ready');
      
      // Set up event listeners
      if (wallet.on) {
        wallet.on('switchAccount', () => {
          addLog('Event: switchAccount');
          checkConnection();
        });
        
        wallet.on('signedOut', () => {
          addLog('Event: signedOut');
          setIsConnected(false);
          setAddresses(null);
          setPubKeys(null);
          setBalance(null);
        });
      }
      
      // Check initial connection
      checkConnection();
    } else {
      setStatus('No wallet detected');
    }
  }, [wallet]);
  
  const checkConnection = async () => {
    if (!wallet) return;
    
    try {
      // Check if isConnected is a function or a property
      let connected = false;
      if (typeof wallet.isConnected === 'function') {
        connected = await wallet.isConnected();
        addLog(`isConnected() function returned: ${connected}`);
      } else if (wallet.isConnected !== undefined) {
        connected = wallet.isConnected;
        addLog(`isConnected property value: ${connected}`);
      } else {
        addLog('No isConnected function or property found on wallet');
      }
      
      setIsConnected(connected);
      
      if (connected) {
        fetchWalletData();
      }
    } catch (error) {
      addLog(`Error checking connection: ${error}`);
    }
  };
  
  const fetchWalletData = async () => {
    if (!wallet) return;
    
    try {
      // Get addresses
      const addressesResult = await wallet.getAddresses();
      addLog(`Got addresses: ${JSON.stringify(addressesResult)}`);
      setAddresses(addressesResult);
      
      // Get public keys
      try {
        const pubKeysResult = await wallet.getPubKeys();
        addLog(`Got public keys: ${JSON.stringify(pubKeysResult)}`);
        setPubKeys(pubKeysResult);
      } catch (error) {
        addLog(`Error getting public keys: ${error}`);
      }
      
      // Get balance
      try {
        const balanceResult = await wallet.getBalance();
        addLog(`Got balance: ${JSON.stringify(balanceResult)}`);
        setBalance(balanceResult);
      } catch (error) {
        addLog(`Error getting balance: ${error}`);
      }
    } catch (error) {
      addLog(`Error fetching wallet data: ${error}`);
    }
  };
  
  const handleConnect = async () => {
    if (!wallet) {
      addLog('No wallet available');
      return;
    }
    
    if (!wallet.isReady) {
      addLog('Wallet not ready, redirecting to yours.org');
      window.open('https://yours.org', '_blank');
      return;
    }
    
    try {
      addLog('Calling wallet.connect()...');
      const result = await wallet.connect();
      addLog(`Connect result: ${result}`);
      
      // Check if connected
      await checkConnection();
    } catch (error) {
      addLog(`Connection error: ${error}`);
    }
  };
  
  const handleDisconnect = async () => {
    if (!wallet?.disconnect) {
      addLog('No disconnect method available');
      return;
    }
    
    try {
      addLog('Calling wallet.disconnect()...');
      await wallet.disconnect();
      addLog('Disconnected');
      setIsConnected(false);
      setAddresses(null);
      setPubKeys(null);
      setBalance(null);
    } catch (error) {
      addLog(`Disconnect error: ${error}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Wallet Connection Test</h1>
      
      <div className="mb-6">
        <div className="text-xl font-semibold mb-2">Status: {status}</div>
        <div className="mb-4">
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className={`px-4 py-2 rounded-lg mr-4 ${
              isConnected 
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            Connect Wallet
          </button>
          
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            className={`px-4 py-2 rounded-lg ${
              !isConnected 
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Disconnect Wallet
          </button>
          
          <button
            onClick={checkConnection}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white ml-4"
          >
            Check Connection
          </button>
          
          <button
            onClick={() => setShowWalletObject(!showWalletObject)}
            className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white ml-4"
          >
            {showWalletObject ? 'Hide Wallet Object' : 'Show Wallet Object'}
          </button>
        </div>
      </div>
      
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Addresses</h2>
            <pre className="bg-gray-200 dark:bg-gray-700 p-3 rounded overflow-auto text-sm">
              {JSON.stringify(addresses, null, 2)}
            </pre>
          </div>
          
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Public Keys</h2>
            <pre className="bg-gray-200 dark:bg-gray-700 p-3 rounded overflow-auto text-sm">
              {JSON.stringify(pubKeys, null, 2)}
            </pre>
          </div>
          
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Balance</h2>
            <pre className="bg-gray-200 dark:bg-gray-700 p-3 rounded overflow-auto text-sm">
              {JSON.stringify(balance, null, 2)}
            </pre>
          </div>
        </div>
      )}
      
      {showWalletObject && wallet && (
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-2">Wallet Object Structure</h2>
          <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded overflow-auto max-h-96">
            <pre className="text-sm">
              {JSON.stringify({
                isReady: wallet.isReady,
                isConnected: wallet.isConnected,
                hasConnect: typeof wallet.connect === 'function',
                hasDisconnect: typeof wallet.disconnect === 'function',
                hasGetAddresses: typeof wallet.getAddresses === 'function',
                hasGetBalance: typeof wallet.getBalance === 'function',
                hasGetPubKeys: typeof wallet.getPubKeys === 'function',
                hasOn: typeof wallet.on === 'function',
                methods: Object.keys(wallet).filter(key => typeof wallet[key] === 'function'),
                properties: Object.keys(wallet).filter(key => typeof wallet[key] !== 'function')
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
      
      <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Logs</h2>
        <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded h-64 overflow-auto">
          {logs.map((log, index) => (
            <div key={index} className="font-mono text-sm mb-1">{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
