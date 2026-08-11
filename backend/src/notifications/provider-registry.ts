/**
 * Provider Registry
 * 
 * Manages notification providers and routes delivery requests
 * to the appropriate channel implementation
 */

import {
  NotificationProvider,
  NotificationChannel
} from './notification.types.js';
import { logger } from '../utils/logger.js';

export class ProviderRegistry {
  private providers = new Map<NotificationChannel, NotificationProvider>();

  /**
   * Register a provider for a channel
   */
  register(provider: NotificationProvider): void {
    if (this.providers.has(provider.channel)) {
      logger.warn('Overwriting existing provider', {
        channel: provider.channel,
        existingProvider: this.providers.get(provider.channel)?.name,
        newProvider: provider.name
      });
    }

    this.providers.set(provider.channel, provider);
    
    logger.info('Provider registered', {
      channel: provider.channel,
      provider: provider.name
    });
  }

  /**
   * Get provider for a channel
   */
  get(channel: NotificationChannel): NotificationProvider | undefined {
    return this.providers.get(channel);
  }

  /**
   * Check if provider is registered for channel
   */
  has(channel: NotificationChannel): boolean {
    return this.providers.has(channel);
  }

  /**
   * Get all registered channels
   */
  getChannels(): NotificationChannel[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all registered providers
   */
  getProviders(): NotificationProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<Map<NotificationChannel, boolean>> {
    const health = new Map<NotificationChannel, boolean>();

    for (const [channel, provider] of this.providers) {
      try {
        if (provider.healthCheck) {
          const healthy = await provider.healthCheck();
          health.set(channel, healthy);
        } else {
          health.set(channel, true); // Assume healthy if no check
        }
      } catch (error) {
        logger.error('Provider health check failed', {
          channel,
          provider: provider.name,
          error
        });
        health.set(channel, false);
      }
    }

    return health;
  }
}
