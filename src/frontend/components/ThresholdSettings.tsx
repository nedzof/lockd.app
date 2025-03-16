import React, { useState, useEffect, useRef } from 'react';
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

const ThresholdSettings: React.FC<ThresholdSettingsProps> = ({ connected, walletAddress }) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [milestoneThreshold, setMilestoneThreshold] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedThreshold = localStorage.getItem('milestoneThreshold');
    return savedThreshold ? Number(savedThreshold) : 1;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  
  // Get user identifier (user_id from localStorage or wallet address)
  const getUserIdentifier = (): string | null => {
    const userId = localStorage.getItem('user_id');
    if (userId) return userId;
    // Use the actual wallet address passed from props when connected
    return connected && walletAddress ? walletAddress : null;
  };
  
  // Check notification permission and subscription status on mount
  useEffect(() => {
    const checkNotificationStatus = async () => {
      if (!connected) return;
      
      try {
        // Get user identifier
        const userId = getUserIdentifier();
        if (!userId) return;
        
        // Reset API availability flag
        setApiAvailable(true);
        
        // Check if the browser supports notifications
        if (!('Notification' in window)) {
          return;
        }
        
        // Check if permission is already granted
        if (Notification.permission === 'granted') {
          // Check if we have a service worker and subscription
          if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
              const registration = await navigator.serviceWorker.ready;
              const subscription = await registration.pushManager.getSubscription();
              setNotificationsEnabled(!!subscription);
            } catch (error) {
              console.error('Error checking notification status:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error checking notification status:', error);
      }
    };
    
    checkNotificationStatus();
  }, [connected]);

  const handleThresholdChange = (value: string) => {
    const numValue = Number(value);
    setMilestoneThreshold(numValue);
    localStorage.setItem('milestoneThreshold', value);
    
    // If notifications are enabled, update subscription with new threshold
    if (notificationsEnabled && apiAvailable) {
      updateNotificationSubscription(numValue);
    }
  };

  // Helper function to convert the VAPID key from base64 to Uint8Array
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    try {
      if (!base64String) {
        throw new Error('Empty VAPID key provided');
      }
      
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

  const toggleNotifications = async () => {
    if (!connected || isSubscribing) return;
    
    try {
      setIsSubscribing(true);
      
      // Check API availability first
      if (!apiAvailable) {
        alert('Notification server is currently unavailable. Please try again later.');
        setIsSubscribing(false);
        return;
      }
      
      if (notificationsEnabled) {
        // Unsubscribe from notifications
        const success = await unsubscribeFromNotifications();
        if (success) {
          setNotificationsEnabled(false);
          localStorage.setItem('notificationsEnabled', 'false');
        }
      } else {
        // Subscribe to notifications
        const success = await subscribeToNotifications();
        if (success) {
          setNotificationsEnabled(true);
          localStorage.setItem('notificationsEnabled', 'true');
        }
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      alert('There was a problem with the notification service. Please try again later.');
    } finally {
      setIsSubscribing(false);
    }
  };

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
          try {
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
              console.error('Server did not accept subscription', response.data);
              return false;
            }
          } catch (err) {
            console.error('Error creating push subscription:', err);
            // Log more detailed error information
            if (err && typeof err === 'object' && 'response' in err) {
              const axiosError = err as { response?: { status?: number, data?: any } };
              console.error(`Status code: ${axiosError.response?.status}, Error details:`, axiosError.response?.data);
            }
            setApiAvailable(false);
            return false;
          }
        } catch (err) {
          console.error('Error creating push subscription:', err);
          setApiAvailable(false);
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

  const unsubscribeFromNotifications = async (): Promise<boolean> => {
    try {
      // Check if we have a user ID
      const userId = getUserIdentifier();
      if (!userId) return false;
      
      // First try to unsubscribe browser subscription
      let browserUnsubscribed = false;
      
      if ('serviceWorker' in navigator) {
        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;
        
        // Get existing subscription
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          // Unsubscribe from push service
          browserUnsubscribed = await subscription.unsubscribe();
          console.log('Unsubscribed from browser push notifications');
        } else {
          // No subscription to unsubscribe from
          browserUnsubscribed = true;
        }
      } else {
        // No service worker support
        browserUnsubscribed = true;
      }
      
      // Then remove subscription from server
      try {
        await axios.post(`${API_BASE_URL}/notifications/unsubscribe`, {
          user_id: userId
        }, {
          timeout: 8000 // 8 second timeout
        });
        
        console.log('Unsubscribed from server notifications');
        return browserUnsubscribed;
      } catch (err) {
        console.error('Error unsubscribing from server:', err);
        setApiAvailable(false);
        return browserUnsubscribed;
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      return false;
    }
  };

  const updateNotificationSubscription = async (threshold: number): Promise<void> => {
    try {
      if (!notificationsEnabled) return;
      
      // Check if we have a user ID
      const userId = getUserIdentifier();
      if (!userId) return;
      
      // Get the service worker registration
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        
        // Get the current subscription
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          // Update the subscription with the new threshold
          await axios.post(`${API_BASE_URL}/notifications/subscribe`, {
            user_id: userId,
            subscription: subscription.toJSON(),
            threshold_value: threshold
          }, {
            timeout: 5000 // 5 second timeout
          });
          
          console.log(`Updated notification threshold to ${threshold} BSV`);
        }
      }
    } catch (error) {
      console.error('Failed to update notification subscription:', error);
      setApiAvailable(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <FiLock className="w-3 h-3" />
        <span>Threshold: {milestoneThreshold} BSV</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop - closes modal when clicked */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm z-[999] transition-opacity duration-300" 
            onClick={() => setIsOpen(false)}
          ></div>
          
          {/* Modal content - positioned under the threshold button */}
          <div
            className="absolute top-6 right-0 w-80 bg-[#1A1B23] rounded-lg shadow-2xl border border-gray-800/40 z-[1000] backdrop-blur-xl overflow-hidden transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium text-white">BSV Threshold</h3>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>
              
              <div className="mb-5">
                <input
                  type="range"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={milestoneThreshold}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-800"
                  style={{
                    background: `linear-gradient(to right, #00ffa3 ${milestoneThreshold}%, #1f2937 ${milestoneThreshold}%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>0.1 BSV</span>
                  <span>{milestoneThreshold} BSV</span>
                  <span>100 BSV</span>
                </div>
              </div>
              
              <div className="flex items-start space-x-2 mb-4">
                <FiInfo className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#00ffa3]" />
                <span className="text-xs text-gray-400">
                  Set your BSV threshold for post visibility and notifications
                </span>
              </div>
              
              {/* Notification toggle */}
              <div className="flex items-center justify-between mb-1 p-2 rounded-lg bg-[#00ffa3]/5 border border-[#00ffa3]/20">
                <div className="flex items-center space-x-2">
                  <FiBell className={`w-4 h-4 ${notificationsEnabled ? 'text-[#00ffa3]' : 'text-gray-400'}`} />
                  <span className="text-xs text-gray-300">Enable Notifications</span>
                </div>
                
                <div 
                  onClick={toggleNotifications}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none cursor-pointer ${notificationsEnabled ? 'bg-[#00ffa3]' : 'bg-gray-600'}`}
                >
                  <span
                    className={`${
                      notificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                    } inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ease-in-out shadow-md`}
                  />
                </div>
              </div>
              
              {isSubscribing && (
                <p className="text-xs text-gray-400 mt-2 animate-pulse">
                  Processing...
                </p>
              )}
              
              {!apiAvailable && (
                <p className="text-xs text-red-400 mt-2">
                  Notification server is currently unavailable
                </p>
              )}
              
              {!connected && (
                <p className="text-xs text-gray-500 mt-2 p-1.5 bg-white/5 rounded border border-gray-700/30">
                  Connect wallet to enable notifications
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ThresholdSettings;
