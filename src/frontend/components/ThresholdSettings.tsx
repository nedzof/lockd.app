import React, { useState, useEffect, useRef } from 'react';
import { FiSettings, FiInfo, FiBell } from 'react-icons/fi';
import axios from 'axios';
import { createPortal } from 'react-dom';

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
  
  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setMilestoneThreshold(Number(value.toFixed(2))); // Round to 2 decimal places
    
    // If notifications are enabled, update the subscription
    if (notificationsEnabled) {
      updateNotificationSubscription(value);
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
            
            console.log('Note: The server will ensure only one active subscription per wallet address');
            
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
      
      console.log(`Updating notification threshold to ${threshold} for user ${userId}`);
      
      // Update threshold on server
      const response = await axios.post(`${API_BASE_URL}/notifications/threshold`, {
        user_id: userId,
        threshold_value: threshold
      });
      
      if (response.data.success) {
        console.log(`Notification threshold updated to ${threshold}`);
      } else {
        console.warn('Failed to update notification threshold:', response.data.message);
        // If the subscription wasn't found, we might need to resubscribe
        if (response.status === 404) {
          console.log('No active subscription found, resubscribing...');
          await subscribeToNotifications();
        }
      }
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
  
  // Handle body overflow when modal is open/closed
  useEffect(() => {
    if (showModal) {
      // Save the current overflow style
      const originalOverflow = document.body.style.overflow;
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore original overflow when component unmounts or modal closes
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showModal]);
  
  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        closeModal();
      }
    };

    if (showModal) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showModal]);
  
  // Open modal
  const openModal = () => {
    setShowModal(true);
    console.log('ThresholdSettings modal opened');
  };
  
  // Close modal
  const closeModal = () => {
    setShowModal(false);
    console.log('ThresholdSettings modal closed');
  };
  
  // Add effect to log when modal state changes
  useEffect(() => {
    if (showModal) {
      console.log('ThresholdSettings modal is now shown');
    }
  }, [showModal]);
  
  return (
    <>
      <button
        data-threshold-settings-toggle
        onClick={openModal}
        className="flex items-center space-x-1 text-xs px-2 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 border border-transparent transition-all duration-200"
        title="BSV Threshold Settings"
      >
        <FiSettings className="w-3 h-3" />
        <span className="hidden sm:inline-block whitespace-nowrap">Threshold</span>
      </button>
      
      {showModal && createPortal(
        <div className="fixed inset-0 flex items-center justify-center overflow-auto backdrop-blur-sm" style={{ zIndex: 9999999 }}>
          <div 
            className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm transition-opacity duration-300" 
            onClick={closeModal}
            aria-hidden="true"
          />
          <div 
            ref={modalRef} 
            className="bg-[#1A1B23] rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 relative border border-gray-800/40 backdrop-blur-xl transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <style>
              {`
                input[type=range]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: #00ffa3;
                  cursor: pointer;
                  border: 2px solid #1A1B23;
                  box-shadow: 0 0 0 2px rgba(0, 255, 163, 0.3);
                }
                
                input[type=range]::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: #00ffa3;
                  cursor: pointer;
                  border: 2px solid #1A1B23;
                  box-shadow: 0 0 0 2px rgba(0, 255, 163, 0.3);
                }
                
                input[type=range]:focus {
                  outline: none;
                }
                
                input[type=range]::-moz-range-progress {
                  background-color: #00ffa3;
                  height: 8px;
                  border-radius: 4px;
                }
              `}
            </style>
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">BSV Threshold</h2>
              <button 
                onClick={closeModal} 
                className="text-gray-400 hover:text-[#00ffa3] transition-colors duration-300"
              >
                &times;
              </button>
            </div>
            
            {notificationsSupported && connected && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <FiBell className="w-5 h-5 mr-2 text-[#00ffa3]" />
                    <span className="text-white font-medium">Notifications</span>
                  </div>
                  
                  <button
                    onClick={toggleNotifications}
                    disabled={isSubscribing}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ease-in-out duration-300 focus:outline-none ${
                      notificationsEnabled ? 'bg-[#00ffa3]' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block w-4 h-4 transform transition ease-in-out duration-300 bg-white rounded-full ${
                        notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {notificationsEnabled && (
                  <p className="text-gray-400 text-sm">
                    Notify when posts reach threshold
                  </p>
                )}
                
                {notificationError && (
                  <div className="bg-red-900/30 border border-red-800 text-red-200 px-3 py-2 rounded text-sm mt-2">
                    {notificationError}
                  </div>
                )}
              </div>
            )}
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300">Threshold:</span>
                <span className="text-[#00ffa3] font-medium">{milestoneThreshold.toFixed(2)} BSV</span>
              </div>
              
              <div className="relative mb-6 px-1 pt-1">
                <input
                  type="range"
                  min="0.01"
                  max="10"
                  step="0.01"
                  value={milestoneThreshold}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ffa3]"
                  style={{
                    background: `linear-gradient(to right, #00ffa3 0%, #00ffa3 ${(milestoneThreshold / 10) * 100}%, #374151 ${(milestoneThreshold / 10) * 100}%, #374151 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.01</span>
                  <span>10</span>
                </div>
              </div>
              
              <p className="text-gray-400 text-sm">
                Hide content below this value
              </p>
            </div>
            
            {!connected && notificationsSupported && (
              <div className="bg-[#13141B]/80 border border-gray-800/40 p-3 rounded-lg text-gray-300 text-sm mb-4">
                Connect wallet for notifications
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-all duration-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ThresholdSettings;
