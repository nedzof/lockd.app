import React, { useState, useEffect } from 'react';
import { FiLock, FiInfo, FiBell } from 'react-icons/fi';
import axios from 'axios';

// API base URL configuration
const API_BASE_URL = '/api'; // This will use the Vite proxy configuration

// Hard-coded VAPID key as fallback - get from env variable if available
const PUBLIC_VAPID_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BMQUltZhc7nPTZSef5a-GtJF1QakZgQRHQA7l0Brh5BhRUya32Y8rlKdBl-xVnPRCdKI6tRosY7LBsrGuEXyE3E';

interface ThresholdSettingsProps {
  connected: boolean;
  walletAddress?: string;
}

const ThresholdSettings: React.FC<ThresholdSettingsProps> = ({ 
  connected,
  walletAddress 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedThreshold = localStorage.getItem('milestoneThreshold');
    return savedThreshold ? Number(savedThreshold) : 1;
  });

  const handleThresholdChange = (value: string) => {
    const numValue = Number(value);
    setMilestoneThreshold(numValue);
    localStorage.setItem('milestoneThreshold', value);
  };

  // Helper function to convert the VAPID key from base64 to Uint8Array
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    try {
      if (!base64String) {
        throw new Error('Empty VAPID key provided');
      }
      
      // Log the VAPID key for debugging (first 10 chars only)
      console.log('VAPID key format (first 10 chars):', base64String.substring(0, 10) + '...');
      
      // Remove whitespace and newlines
      const trimmedBase64 = base64String.trim().replace(/[\n\r]/g, '');
      
      // Replace web-safe characters with standard base64 characters
      const standardBase64 = trimmedBase64.replace(/-/g, '+').replace(/_/g, '/');
      
      // Add padding if needed
      const paddingNeeded = (4 - standardBase64.length % 4) % 4;
      const paddedBase64 = standardBase64 + '='.repeat(paddingNeeded);
      
      try {
        // Decode base64 to binary string
        const rawData = window.atob(paddedBase64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        
        // Log array size for debugging
        console.log('Converted VAPID key to Uint8Array of length:', outputArray.length);
        
        return outputArray;
      } catch (atobError) {
        console.error('Failed to decode base64 string:', atobError);
        throw new Error('Invalid base64 encoding in VAPID key');
      }
    } catch (error) {
      console.error('Error converting VAPID key:', error);
      throw new Error('Failed to convert VAPID key: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  const subscribeToNotifications = async (): Promise<boolean> => {
    try {
      // First check if the browser supports notifications
      if (!('Notification' in window)) {
        alert('Your browser does not support notifications');
        return false;
      }
      
      // Then check if we have a user ID
      const userId = getUserIdentifier();
      if (!userId) {
        alert('Your wallet must be connected to receive notifications');
        return false;
      }
      
      // Check if permission is already granted
      let permission = Notification.permission;
      if (permission !== 'granted') {
        // Request permission
        permission = await Notification.requestPermission();
      }
      
      if (permission === 'granted') {
        // Check if we have a service worker
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          alert('Your browser does not support push notifications');
          return false;
        }
        
        try {
          // Wait for service worker to be ready
          const registration = await navigator.serviceWorker.ready;
          
          // Get existing subscription or create a new one
          let subscription = await registration.pushManager.getSubscription();
          
          // If no subscription exists, create one
          if (!subscription) {
            try {
              // Check if VAPID key is available
              if (!PUBLIC_VAPID_KEY) {
                console.error('VAPID key is missing');
                alert('Server configuration error: VAPID key is missing');
                return false;
              }
              
              console.log('Using VAPID key:', PUBLIC_VAPID_KEY);
              
              // Convert VAPID key to Uint8Array
              const convertedVapidKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
              
              // Create subscription
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
              });
            } catch (subscribeError) {
              console.error('Error subscribing to push service:', subscribeError);
              alert(`Failed to subscribe to notifications: ${subscribeError instanceof Error ? subscribeError.message : 'Unknown error'}`);
              return false;
            }
          }
          
          // Send subscription to server
          const response = await axios.post(`${API_BASE_URL}/notifications/subscribe`, {
            user_id: userId,
            subscription: subscription.toJSON(),
            threshold_value: milestoneThreshold
          }, {
            timeout: 8000 // 8 second timeout
          });
          
          if (response.data.success) {
            console.log('Successfully subscribed to notifications');
            
            // Make a visible notification to confirm subscription
            new Notification('Notifications Enabled', {
              body: `You will be notified when posts reach ${milestoneThreshold} BSV.`,
              icon: '/favicon.ico'
            });
            
            return true;
          } else {
            console.error('Server did not accept subscription');
            return false;
          }
        } catch (err) {
          console.error('Error creating push subscription:', err);
          setApiAvailable(false); // Mark API as unavailable
          return false;
        }
      } else {
        alert('You must allow notifications to use this feature');
        return false;
      }
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      return false;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <FiLock className="w-3 h-3" />
        <span>Threshold: {milestoneThreshold} BSV</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#2A2A40] rounded-lg shadow-lg p-4 z-50 border border-gray-800/30">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-white">BSV Threshold</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              &times;
            </button>
          </div>
          
          <div className="mb-4">
            <input
              type="range"
              min="0.1"
              max="100"
              step="0.1"
              value={milestoneThreshold}
              onChange={(e) => handleThresholdChange(e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-800"
              style={{
                background: `linear-gradient(to right, #00E6CC ${milestoneThreshold}%, #1f2937 ${milestoneThreshold}%)`,
              }}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>0.1 BSV</span>
              <span>{milestoneThreshold} BSV</span>
              <span>100 BSV</span>
            </div>
          </div>
          
          <div className="text-xs text-gray-400 flex items-start space-x-2">
            <FiInfo className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#00E6CC]" />
            <span>Set your BSV threshold for post visibility and notifications</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThresholdSettings;
