import React, { useState, useEffect, useRef } from 'react';
import { FiLock, FiInfo, FiBell, FiBellOff } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { createPortal } from 'react-dom';
import { useWallet } from '../providers/WalletProvider';

interface ThresholdSettingsProps {
  connected: boolean;
}

const ThresholdSettings: React.FC<ThresholdSettingsProps> = ({ connected }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedThreshold = localStorage.getItem('milestoneThreshold');
    return savedThreshold ? Number(savedThreshold) : 1;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [notificationsPermission, setNotificationsPermission] = useState<NotificationPermission | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [modalPosition, setModalPosition] = useState({ top: 0, right: 0 });
  const { bsvAddress } = useWallet();
  const [apiBasePath, setApiBasePath] = useState('/api/notifications');

  useEffect(() => {
    // Check if notifications are supported
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setNotificationsSupported(isSupported);

    if (isSupported) {
      // Check if notifications are already enabled
      setNotificationsPermission(Notification.permission);
      setNotificationsEnabled(Notification.permission === 'granted' && localStorage.getItem('pushNotificationsEnabled') === 'true');
    }
  }, []);

  // Update modal position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
          setModalPosition({
            top: rect.bottom + window.scrollY + 5,
            right: window.innerWidth - rect.right
          });
        }
      };
      
      updatePosition();
      
      // Add resize listener
      window.addEventListener('resize', updatePosition);
      
      // Clean up
      return () => {
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const handleThresholdChange = (value: string) => {
    const numValue = Number(value);
    setMilestoneThreshold(numValue);
    localStorage.setItem('milestoneThreshold', value);

    // If notifications are enabled, update the threshold on the server
    if (notificationsEnabled && connected) {
      updateNotificationThreshold(numValue);
    }
  };

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      throw error;
    }
  };

  const subscribeToPushNotifications = async (userId: string) => {
    try {
      // Register service worker
      console.log('Registering service worker...');
      const registration = await registerServiceWorker();
      console.log('Service worker registered successfully');

      // Since the server API is not working properly, use the fallback key directly
      console.log('Using fallback VAPID key since server API is not available');
      const publicKey = 'BLBz5U0ynWG4O3RsQKR9Lm0K1-oFhLfEEbZV0MdkbiCUuH4U5C-V2yU9xCYhjuCw-V5AULjJqSRZVlSMjTmxqTo';
      
      // Convert base64 string to Uint8Array
      console.log('Converting public key to Uint8Array...');
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Subscribe to push notifications
      console.log('Subscribing to push notifications...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
      console.log('Push subscription created:', subscription);

      // Store subscription in localStorage since server API is not available
      try {
        const subscriptions = JSON.parse(localStorage.getItem('pushSubscriptions') || '{}');
        
        // Safely extract keys from the subscription
        let p256dhKey = '';
        let authKey = '';
        
        try {
          const p256dhBuffer = subscription.getKey('p256dh');
          const authBuffer = subscription.getKey('auth');
          
          if (p256dhBuffer) {
            p256dhKey = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(p256dhBuffer))));
          }
          
          if (authBuffer) {
            authKey = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(authBuffer))));
          }
        } catch (keyError) {
          console.error('Error extracting keys from subscription:', keyError);
        }
        
        subscriptions[userId] = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: p256dhKey,
            auth: authKey
          },
          thresholdValue: milestoneThreshold,
          createdAt: new Date().toISOString()
        };
        
        localStorage.setItem('pushSubscriptions', JSON.stringify(subscriptions));
        console.log('Subscription stored in localStorage');
        
        // Show a message to the user
        toast.success('Notifications enabled locally (server sync unavailable)');
      } catch (storageError) {
        console.error('Error storing subscription in localStorage:', storageError);
      }
      
      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      toast.error(`Failed to enable notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const unsubscribeFromPushNotifications = async (userId: string) => {
    try {
      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Get push subscription
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Unsubscribe from push notifications
        await subscription.unsubscribe();
        
        // Remove subscription from localStorage
        try {
          const subscriptions = JSON.parse(localStorage.getItem('pushSubscriptions') || '{}');
          delete subscriptions[userId];
          localStorage.setItem('pushSubscriptions', JSON.stringify(subscriptions));
          console.log('Subscription removed from localStorage');
        } catch (storageError) {
          console.error('Error removing subscription from localStorage:', storageError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      toast.error(`Failed to disable notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const updateNotificationThreshold = async (threshold: number) => {
    try {
      if (!connected) return;
      
      // Get user ID from wallet context
      if (!bsvAddress) {
        console.error('Wallet address not found in context');
        return;
      }
      
      // Update threshold in localStorage
      try {
        const subscriptions = JSON.parse(localStorage.getItem('pushSubscriptions') || '{}');
        if (subscriptions[bsvAddress]) {
          subscriptions[bsvAddress].thresholdValue = threshold;
          localStorage.setItem('pushSubscriptions', JSON.stringify(subscriptions));
          console.log('Threshold updated in localStorage');
        }
      } catch (storageError) {
        console.error('Error updating threshold in localStorage:', storageError);
      }
    } catch (error) {
      console.error('Error updating notification threshold:', error);
    }
  };

  const handleToggleNotifications = async () => {
    if (!connected) {
      toast.error('Please connect your wallet to enable notifications');
      return;
    }

    if (!notificationsSupported) {
      toast.error('Push notifications are not supported in your browser');
      return;
    }

    try {
      if (!notificationsEnabled) {
        // Request permission if not already granted
        if (Notification.permission !== 'granted') {
          const permission = await Notification.requestPermission();
          setNotificationsPermission(permission);
          
          if (permission !== 'granted') {
            toast.error('Notification permission denied');
            return;
          }
        }
        
        // Get user ID from wallet context
        if (!bsvAddress) {
          toast.error('Wallet address not found');
          return;
        }
        
        // Subscribe to push notifications
        const success = await subscribeToPushNotifications(bsvAddress);
        
        if (success) {
          setNotificationsEnabled(true);
          localStorage.setItem('pushNotificationsEnabled', 'true');
          // Toast message is now handled in subscribeToPushNotifications
        } else {
          toast.error('Failed to enable notifications');
        }
      } else {
        // Get user ID from wallet context
        if (!bsvAddress) {
          toast.error('Wallet address not found');
          return;
        }
        
        // Unsubscribe from push notifications
        const success = await unsubscribeFromPushNotifications(bsvAddress);
        
        if (success) {
          setNotificationsEnabled(false);
          localStorage.setItem('pushNotificationsEnabled', 'false');
          toast.success('Notifications disabled');
        } else {
          toast.error('Failed to disable notifications');
        }
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      toast.error('An error occurred while managing notifications');
    }
  };

  // Helper function to convert base64 to Uint8Array
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors"
        ref={buttonRef}
      >
        <FiLock className="w-3 h-3" />
        <span>Threshold: {milestoneThreshold} BSV</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 isolate" style={{ zIndex: 999999 }}>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          {/* Modal container - positioned absolutely */}
          <div 
            className="fixed animate-fade-in"
            style={{ 
              top: `${modalPosition.top}px`, 
              right: `${modalPosition.right}px`,
              zIndex: 999999
            }}
          >
            <div 
              className="w-64 bg-[#2A2A40] rounded-lg shadow-xl p-4 border border-gray-800/30"
              onClick={(e) => e.stopPropagation()}
            >
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
              
              {notificationsSupported && connected && (
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-gray-300">Notifications</span>
                  <button
                    onClick={handleToggleNotifications}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs ${
                      notificationsEnabled
                        ? 'bg-[#00ffa3]/20 text-[#00ffa3]'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {notificationsEnabled ? (
                      <>
                        <FiBell className="w-3 h-3" />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <FiBellOff className="w-3 h-3" />
                        <span>Disabled</span>
                      </>
                    )}
                  </button>
                </div>
              )}
              
              <div className="text-xs text-gray-400 flex items-start space-x-2">
                <FiInfo className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#00E6CC]" />
                <span>
                  Set your BSV threshold for post visibility and notifications. 
                  {notificationsSupported && connected && " Enable notifications to get alerts when posts reach your threshold."}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ThresholdSettings;
