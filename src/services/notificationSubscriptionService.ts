import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Define types for our models since Prisma's generated types might not be updated yet
interface NotificationSubscription {
  id: string;
  wallet_address: string;
  session_id?: string | null;
  threshold_value: number;
  notifications_enabled: boolean;
  subscription_data: any;
  endpoint?: string | null;
  created_at: Date;
  updated_at: Date;
  last_notified_at?: Date | null;
}

// Add missing model to Prisma client
const prismaWithTypes = new PrismaClient() as PrismaClient & {
  notification_subscription: {
    findFirst: (args: any) => Promise<NotificationSubscription | null>;
    findMany: (args: any) => Promise<NotificationSubscription[]>;
    create: (args: any) => Promise<NotificationSubscription>;
    update: (args: any) => Promise<NotificationSubscription>;
    updateMany: (args: any) => Promise<{ count: number }>;
  }
};

/**
 * Service for managing notification subscriptions
 */
export class NotificationSubscriptionService {
  
  /**
   * Create or update a notification subscription
   * 
   * @param wallet_address - User's wallet address
   * @param subscription_data - Push subscription data from browser
   * @param threshold_value - BSV threshold value for notifications
   * @param session_id - Optional session ID for tracking
   * @returns The created or updated subscription
   */
  async subscribe(
    wallet_address: string,
    subscription_data: any,
    threshold_value: number = 1.0,
    session_id?: string
  ) {
    try {
      logger.info(`Creating/updating subscription for wallet: ${wallet_address}`, {
        threshold_value,
        has_session: !!session_id
      });
      
      const endpoint = subscription_data?.endpoint;
      
      if (!endpoint) {
        throw new Error('Subscription endpoint is required');
      }
      
      // Find existing subscription by wallet and endpoint
      const existingSubscription = await prismaWithTypes.notification_subscription.findFirst({
        where: {
          wallet_address,
          endpoint,
        }
      });
      
      if (existingSubscription) {
        // Update existing subscription
        return await prismaWithTypes.notification_subscription.update({
          where: { id: existingSubscription.id },
          data: {
            threshold_value,
            notifications_enabled: true,
            subscription_data: subscription_data,
            session_id: session_id ?? existingSubscription.session_id,
            updated_at: new Date(),
          }
        });
      } else {
        // Create new subscription
        return await prismaWithTypes.notification_subscription.create({
          data: {
            wallet_address,
            threshold_value,
            notifications_enabled: true,
            subscription_data,
            endpoint,
            session_id,
          }
        });
      }
    } catch (error) {
      logger.error('Error creating notification subscription:', error);
      throw error;
    }
  }
  
  /**
   * Unsubscribe from notifications
   * 
   * @param wallet_address - User's wallet address
   * @param endpoint - Push subscription endpoint
   * @returns True if unsubscribed successfully
   */
  async unsubscribe(wallet_address: string, endpoint?: string) {
    try {
      logger.info(`Unsubscribing notifications for wallet: ${wallet_address}`);
      
      if (endpoint) {
        // Unsubscribe specific endpoint
        await prismaWithTypes.notification_subscription.updateMany({
          where: { wallet_address, endpoint },
          data: { 
            notifications_enabled: false,
            updated_at: new Date(),
          }
        });
      } else {
        // Unsubscribe all endpoints for this wallet
        await prismaWithTypes.notification_subscription.updateMany({
          where: { wallet_address },
          data: { 
            notifications_enabled: false,
            updated_at: new Date(),
          }
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Error unsubscribing from notifications:', error);
      throw error;
    }
  }
  
  /**
   * Update notification threshold
   * 
   * @param wallet_address - User's wallet address
   * @param threshold_value - New BSV threshold value
   * @returns True if updated successfully
   */
  async updateThreshold(wallet_address: string, threshold_value: number) {
    try {
      logger.info(`Updating threshold for wallet: ${wallet_address} to ${threshold_value}`);
      
      await prismaWithTypes.notification_subscription.updateMany({
        where: { 
          wallet_address,
          notifications_enabled: true
        },
        data: { 
          threshold_value,
          updated_at: new Date(),
        }
      });
      
      return true;
    } catch (error) {
      logger.error('Error updating notification threshold:', error);
      throw error;
    }
  }
  
  /**
   * Get subscription status for a wallet
   * 
   * @param wallet_address - User's wallet address
   * @returns Subscription status information
   */
  async getSubscriptionStatus(wallet_address: string) {
    try {
      const subscriptions = await prismaWithTypes.notification_subscription.findMany({
        where: { wallet_address }
      });
      
      const activeSubscription = subscriptions.find(sub => sub.notifications_enabled);
      
      return {
        isSubscribed: subscriptions.some(sub => sub.notifications_enabled),
        subscriptionCount: subscriptions.length,
        activeSubscriptions: subscriptions.filter(sub => sub.notifications_enabled).length,
        threshold: activeSubscription?.threshold_value ?? null,
      };
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      throw error;
    }
  }
  
  /**
   * Find subscriptions that meet a threshold criteria
   * 
   * @param minThreshold - Minimum threshold value to match
   * @returns Array of matching subscriptions
   */
  async findSubscriptionsByThreshold(minThreshold: number) {
    try {
      return await prismaWithTypes.notification_subscription.findMany({
        where: {
          threshold_value: { lte: minThreshold },
          notifications_enabled: true
        }
      });
    } catch (error) {
      logger.error('Error finding subscriptions by threshold:', error);
      throw error;
    }
  }
  
  /**
   * Update the last notified timestamp for a subscription
   * 
   * @param subscriptionId - ID of the subscription to update
   * @returns The updated subscription
   */
  async updateLastNotified(subscriptionId: string) {
    try {
      return await prismaWithTypes.notification_subscription.update({
        where: { id: subscriptionId },
        data: { 
          last_notified_at: new Date(),
          updated_at: new Date(),
        }
      });
    } catch (error) {
      logger.error('Error updating last notified timestamp:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const notificationSubscriptionService = new NotificationSubscriptionService(); 