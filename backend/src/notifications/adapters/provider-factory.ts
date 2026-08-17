/**
 * Notification Provider Factory
 * Creates and manages notification provider instances
 */

import type {
  NotificationProvider,
  ProviderConfig,
  NotificationChannel,
  ProviderType,
} from '../domain/notification.types.js';
import { SMTPEmailProvider } from './email-smtp.adapter.js';
import { SMSGatewayProvider } from './sms-gateway.adapter.js';
import { VoiceSIPProvider, TwilioVoiceProvider } from './voice-sip.adapter.js';
import { DashboardWebSocketProvider } from './dashboard-websocket.adapter.js';
import { logger } from '../../utils/logger.js';

export class NotificationProviderFactory {
  private providers: Map<string, NotificationProvider> = new Map();
  private providersByChannel: Map<NotificationChannel, NotificationProvider[]> = new Map();

  /**
   * Create and initialize a provider
   */
  async createProvider(config: ProviderConfig): Promise<NotificationProvider> {
    // Check if provider already exists
    const existingProvider = this.providers.get(config.providerKey);
    if (existingProvider) {
      return existingProvider;
    }

    // Create new provider based on type
    let provider: NotificationProvider;

    switch (config.providerType) {
      case 'SMTP':
        provider = new SMTPEmailProvider(config.providerKey);
        break;

      case 'SMPP':
      case 'GSM_MODEM':
        provider = new SMSGatewayProvider(config.providerKey);
        break;

      case 'SIP':
        provider = new VoiceSIPProvider(config.providerKey);
        break;

      case 'TWILIO':
        if (config.channel === 'voice') {
          provider = new TwilioVoiceProvider(config.providerKey);
        } else {
          throw new Error(`Twilio provider not supported for channel: ${config.channel}`);
        }
        break;

      case 'WEBSOCKET':
        provider = new DashboardWebSocketProvider(config.providerKey);
        break;

      default:
        throw new Error(`Unsupported provider type: ${config.providerType}`);
    }

    // Initialize provider
    await provider.initialize(config);

    // Store provider
    this.providers.set(config.providerKey, provider);

    // Index by channel
    const channelProviders = this.providersByChannel.get(config.channel) || [];
    channelProviders.push(provider);
    this.providersByChannel.set(config.channel, channelProviders);

    logger.info('Provider created and initialized', {
      providerKey: config.providerKey,
      providerType: config.providerType,
      channel: config.channel,
    });

    return provider;
  }

  /**
   * Get provider by key
   */
  getProvider(providerKey: string): NotificationProvider | undefined {
    return this.providers.get(providerKey);
  }

  /**
   * Get all providers for a channel
   */
  getProvidersForChannel(channel: NotificationChannel): NotificationProvider[] {
    return this.providersByChannel.get(channel) || [];
  }

  /**
   * Get default provider for a channel
   */
  getDefaultProvider(channel: NotificationChannel): NotificationProvider | undefined {
    const providers = this.getProvidersForChannel(channel);
    return providers[0]; // First provider is default
  }

  /**
   * Remove a provider
   */
  removeProvider(providerKey: string): void {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      return;
    }

    // Remove from channel index
    const channelProviders = this.providersByChannel.get(provider.channel);
    if (channelProviders) {
      const index = channelProviders.indexOf(provider);
      if (index !== -1) {
        channelProviders.splice(index, 1);
      }
    }

    // Remove from main map
    this.providers.delete(providerKey);

    logger.info('Provider removed', { providerKey });
  }

  /**
   * Get all providers
   */
  getAllProviders(): NotificationProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Health check all providers
   */
  async checkAllProviders(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const healthChecks = Array.from(this.providers.entries()).map(
      async ([key, provider]) => {
        try {
          const health = await provider.checkHealth();
          results.set(key, health.healthy);
        } catch (error) {
          logger.error('Provider health check failed', {
            providerKey: key,
            error: error instanceof Error ? error.message : String(error),
          });
          results.set(key, false);
        }
      }
    );

    await Promise.all(healthChecks);

    return results;
  }

  /**
   * Load providers from configurations
   */
  async loadProviders(configs: ProviderConfig[]): Promise<void> {
    const enabledConfigs = configs.filter(c => c.enabled);

    logger.info('Loading notification providers', {
      total: configs.length,
      enabled: enabledConfigs.length,
    });

    for (const config of enabledConfigs) {
      try {
        await this.createProvider(config);
      } catch (error) {
        logger.error('Failed to load provider', {
          providerKey: config.providerKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

// Singleton instance
export const providerFactory = new NotificationProviderFactory();
