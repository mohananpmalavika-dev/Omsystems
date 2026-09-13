import { ProductionMockForbiddenError } from '../../packages/contracts/src/execution/index.js';

export interface DeliveryRequest {
  id: string;
  destination: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

export interface DeliveryResult {
  providerMessageId?: string;
  status: 'accepted' | 'sent' | 'delivered' | 'failed';
  error?: string;
  metadata?: Record<string, any>;
}

export interface NotificationProvider {
  readonly channel: string;
  readonly name: string;
  send(request: DeliveryRequest): Promise<DeliveryResult>;
}

export class MockProvider implements NotificationProvider {
  readonly channel: string;
  readonly name: string;
  private deliveries: Array<{ request: DeliveryRequest; timestamp: Date }> = [];

  constructor(channel: string, name?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ProductionMockForbiddenError('MockProvider is strictly forbidden in production mode.');
    }
    this.channel = channel;
    this.name = name || `mock-${channel}`;
  }

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new ProductionMockForbiddenError('MockProvider delivery is strictly forbidden in production mode.');
    }
    this.deliveries.push({ request, timestamp: new Date() });
    return {
      providerMessageId: `mock-${Date.now()}-${Math.random()}`,
      status: 'accepted',
      metadata: { mockDelivery: true },
    };
  }

  getDeliveries() {
    return [...this.deliveries];
  }
}

export class ProviderRegistry {
  private providers = new Map<string, NotificationProvider>();

  register(provider: NotificationProvider): void {
    const isMock = provider.name.toLowerCase().includes('mock') || provider.constructor.name === 'MockProvider';
    if (process.env.NODE_ENV === 'production' && isMock) {
      throw new ProductionMockForbiddenError(`Cannot register mock provider '${provider.name}' in production mode.`);
    }
    this.providers.set(provider.channel, provider);
  }

  get(channel: string): NotificationProvider | undefined {
    return this.providers.get(channel);
  }

  has(channel: string): boolean {
    return this.providers.has(channel);
  }
}
