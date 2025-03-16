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
  const [showModal, setShowModal] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState<number>(0.1);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [isSubscribing, setIsSubscribing] = useState<boolean>(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Check if this browser supports notifications
  const notificationsSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

  // Get user identifier (wallet address or session ID)
  const getUserIdentifier = (): string | null => {
    // Prefer authenticated wallet address
    if (connected && walletAddress) {
      return walletAddress;
    }
    
    // Fallback to anonymous session
    return null;
  };
  
  // Check notification status when component mounts or wallet connection changes
  useEffect(() => {
    const checkNotificationStatus = async () => {
      try {
        const userId = getUserIdentifier();
        if (!userId) {
          setNotificationsEnabled(false);
          return;
        }
        
        // Make API call to check subscription status
        try {
          const response = await axios.get(`${API_BASE_URL}/notifications/status/${userId}`);
          if (response.data.success) {
            setNotificationsEnabled(response.data.subscribed);
            
            // If there's a threshold set, use it
            if (response.data.threshold) {
              setMilestoneThreshold(response.data.threshold);
            }
          }
        } catch (error) {
          console.warn('Failed to check notification status:', error);
          // Don't set an error message here to avoid showing errors on page load
          setNotificationsEnabled(false);
        }
      } catch (error) {
        console.error('Error checking notification status:', error);
        setNotificationsEnabled(false);
      }
    };
    
    if (connected && notificationsSupported) {
      checkNotificationStatus();
    }
  }, [connected]);
  
  // Handle threshold change
  const handleThresholdChange = (value: string) => {
    // Convert to number and validate
    const numValue = parseFloat(value);
    
    if (!isNaN(numValue) && numValue > 0) {
      setMilestoneThreshold(numValue);
      
      // If notifications are enabled, update the subscription
      if (notificationsEnabled) {
        updateNotificationSubscription(numValue);
      }
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
  
  // Toggle notifications on/off
  const toggleNotifications = async () => {
    setNotificationError(null);
    
    if (!notificationsSupported) {
      setNotificationError('Your browser does not support notifications');
      return;
    }
    
    try {
      setIsSubscribing(true);
      
      if (notificationsEnabled) {
        // Unsubscribe
        const success = await unsubscribeFromNotifications();
        if (success) {
          setNotificationsEnabled(false);
        }
      } else {
        // Subscribe
        const success = await subscribeToNotifications();
        if (success) {
          setNotificationsEnabled(true);
        }
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      setNotificationError(`There was a problem with the notification service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubscribing(false);
    }
  };

  const subscribeToNotifications = async (): Promise<boolean> => {
    try {
      // First check if the browser supports notifications
      if (!('Notification' in window)) {
        setNotificationError('Your browser does not support notifications');
        return false;
      }
      
      // Then check if we have a user ID
      const userId = getUserIdentifier();
      if (!userId) {
        setNotificationError('Your wallet must be connected to receive notifications');
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
          setNotificationError('Your browser does not support push notifications');
          return false;
        }
        
        try {
          // Wait for service worker to be ready
          const registration = await navigator.serviceWorker.ready;
          console.log('Service worker registration ready:', registration);
          
          // Get existing subscription or create a new one
          let subscription = await registration.pushManager.getSubscription();
          console.log('Current subscription:', subscription);
          
          // If no subscription exists, create one
          if (!subscription) {
            try {
              // Check if VAPID key is available
              if (!PUBLIC_VAPID_KEY) {
                console.error('VAPID key is missing');
                setNotificationError('Server configuration error: VAPID key is missing');
                return false;
              }
              
              // Convert VAPID key to Uint8Array
              const convertedVapidKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
              
              // Create subscription
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
              });
              
              console.log('New subscription created:', subscription);
            } catch (subscribeError) {
              console.error('Error subscribing to push service:', subscribeError);
              setNotificationError(`Failed to subscribe to notifications: ${subscribeError instanceof Error ? subscribeError.message : 'Unknown error'}`);
              return false;
            }
          }
          
          // Send subscription to server
          try {
            console.log('Sending subscription to server with data:', {
              user_id: userId,
              threshold_value: milestoneThreshold,
              subscription_json: subscription.toJSON()
            });
            
            const response = await axios.post(`${API_BASE_URL}/notifications/subscribe`, {
              user_id: userId,
              subscription: subscription.toJSON(),
              threshold_value: milestoneThreshold
            }, {
              timeout: 10000 // 10 second timeout
            });
            
            if (response.data.success) {
              console.log('Successfully subscribed to notifications:', response.data);
              
              // Make a visible notification to confirm subscription
              try {
                new Notification('Notifications Enabled', {
                  body: `You will be notified when posts reach ${milestoneThreshold} BSV.`,
                  icon: '/favicon.ico'
                });
              } catch (notifyError) {
                console.warn('Could not display confirmation notification:', notifyError);
                // This is non-critical, so we don't fail the overall subscription
              }
              
              return true;
            } else {
              console.error('Server did not accept subscription', response.data);
              setNotificationError(`Server error: ${response.data.message || 'Unknown error'}`);
              return false;
            }
          } catch (err) {
            console.error('Error creating push subscription:', err);
            
            // Log more detailed error information
            if (err && typeof err === 'object' && 'response' in err) {
              const axiosError = err as { response?: { status?: number, data?: any } };
              console.error(`Status code: ${axiosError.response?.status}, Error details:`, axiosError.response?.data);
              
              // Provide more detailed error message
              if (axiosError.response?.status === 500) {
                setNotificationError('Server error: The notification service is currently unavailable. Please try again later.');
              } else if (axiosError.response?.data?.message) {
                setNotificationError(`Server error: ${axiosError.response.data.message}`);
              } else {
                setNotificationError('Failed to register for notifications. Please try again later.');
              }
            } else {
              setNotificationError('Network error. Please check your connection and try again.');
            }
            
            return false;
          }
        } catch (error) {
          console.error('Service worker error:', error);
          setNotificationError(`Service worker error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      } else if (permission === 'denied') {
        setNotificationError('Notification permission denied. Please enable notifications in your browser settings.');
        return false;
      } else {
        setNotificationError('Notification permission was not granted.');
        return false;
      }
    } catch (error) {
      console.error('Unexpected error in subscribeToNotifications:', error);
      setNotificationError(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };
  
  const unsubscribeFromNotifications = async (): Promise<boolean> => {
    try {
      const userId = getUserIdentifier();
      if (!userId) {
        setNotificationError('Your wallet must be connected to manage notifications');
        return false;
      }
      
      // Get SW registration and unsubscribe from push
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          // Get the endpoint to unsubscribe from server
          const endpoint = subscription.endpoint;
          
          try {
            // First unsubscribe on server
            await axios.post(`${API_BASE_URL}/notifications/unsubscribe`, {
              user_id: userId,
              endpoint
            });
            
            // Then unsubscribe in browser
            await subscription.unsubscribe();
            
            console.log('Successfully unsubscribed from notifications');
            return true;
          } catch (error) {
            console.error('Error unsubscribing from notifications:', error);
            
            // Even if server unsubscribe fails, try to unsubscribe in browser
            try {
              await subscription.unsubscribe();
            } catch (browserError) {
              console.error('Error unsubscribing in browser:', browserError);
            }
            
            setNotificationError('Error unsubscribing from notifications, but notifications have been disabled in this browser.');
            return true; // Return true because we consider this "unsubscribed" from the user's perspective
          }
        } else {
          // No subscription in browser, just notify the server
          try {
            await axios.post(`${API_BASE_URL}/notifications/unsubscribe`, {
              user_id: userId
            });
            
            console.log('Successfully unsubscribed from server notifications');
            return true;
          } catch (error) {
            console.error('Error unsubscribing from server notifications:', error);
            setNotificationError('Error unsubscribing from server. Please try again later.');
            return false;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error unsubscribing from notifications:', error);
      setNotificationError(`Error unsubscribing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };
  
  const updateNotificationSubscription = async (threshold: number): Promise<void> => {
    try {
      const userId = getUserIdentifier();
      if (!userId || !notificationsEnabled) {
        return;
      }
      
      // Update threshold on server
      await axios.post(`${API_BASE_URL}/notifications/threshold`, {
        user_id: userId,
        threshold_value: threshold
      });
      
      console.log(`Notification threshold updated to ${threshold}`);
    } catch (error) {
      console.error('Error updating notification threshold:', error);
      // We don't show an error to the user for threshold updates
    }
  };
  
  // Handle clicking outside modal to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
      }
    };
    
    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModal]);
  
  // Open modal
  const openModal = () => {
    setShowModal(true);
  };
  
  // Close modal
  const closeModal = () => {
    setShowModal(false);
  };
  
  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center justify-center space-x-2 py-1.5 px-3 bg-gray-800 text-white rounded hover:bg-gray-700 transition duration-200 text-sm"
      >
        <FiLock className="w-4 h-4" />
        <span>BSV Threshold</span>
      </button>
      
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black bg-opacity-50 pt-24">
          <div ref={modalRef} className="bg-gray-900 border border-gray-800 rounded-md shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">BSV Threshold Settings</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">
                &times;
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-300 mb-4">Set the minimum BSV threshold for items you see. Content with less BSV value will be hidden.</p>
              
              <div className="flex items-center mb-2">
                <span className="text-gray-300 mr-3">Threshold:</span>
                <input
                  type="text"
                  value={milestoneThreshold}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-24"
                />
                <span className="text-gray-300 ml-3">BSV</span>
              </div>
              
              <div className="text-gray-400 text-sm flex items-start">
                <FiInfo className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                <span>Setting a higher threshold will show fewer items, but with higher value.</span>
              </div>
            </div>
            
            {notificationsSupported && (
              <div className="border-t border-gray-800 pt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <FiBell className="w-5 h-5 mr-2 text-cyan-400" />
                    <span className="text-white font-medium">Notifications</span>
                  </div>
                  
                  <button
                    onClick={toggleNotifications}
                    disabled={isSubscribing || !connected}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ease-in-out duration-300 focus:outline-none ${
                      notificationsEnabled ? 'bg-cyan-500' : 'bg-gray-700'
                    } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block w-4 h-4 transform transition ease-in-out duration-300 bg-white rounded-full ${
                        notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                <p className="text-gray-400 text-sm mb-3">
                  {notificationsEnabled
                    ? `You will be notified when posts reach ${milestoneThreshold} BSV.`
                    : `Enable to receive notifications when posts reach ${milestoneThreshold} BSV.`}
                </p>
                
                {notificationError && (
                  <div className="bg-red-900/30 border border-red-800 text-red-200 px-3 py-2 rounded text-sm mt-2">
                    {notificationError}
                  </div>
                )}
                
                {!connected && (
                  <div className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded text-sm mt-2">
                    Connect your wallet to enable notifications.
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ThresholdSettings;
