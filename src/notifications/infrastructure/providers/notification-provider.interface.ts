/**
 * Notification Provider Interface & Registry
 */

import type {
  NotificationChannel,
  NotificationJob,
  ProviderSendResult,
  ProviderHealth,
} from "../../domain/notification.types.js";

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(job: NotificationJob): Promise<ProviderSendResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

export class NotificationProviderRegistry {
  private providers: Map<NotificationChannel, NotificationProvider> = new Map();

  register(provider: NotificationProvider) {
    this.providers.set(provider.channel, provider);
  }

  get(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new Error(`No notification provider registered for channel '${channel}'`);
    }
    return provider;
  }

  has(channel: NotificationChannel): boolean {
    return this.providers.has(channel);
  }

  getAll(): NotificationProvider[] {
    return Array.from(this.providers.values());
  }
}

export const notificationProviderRegistry = new NotificationProviderRegistry();
