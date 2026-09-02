/**
 * Mock Provider
 * 
 * Simulates delivery without actually sending
 * Useful for testing and development
 */

import {
  NotificationProvider,
  DeliveryRequest,
  DeliveryResult,
  NotificationChannel
} from '../notification.types.js';
import { logger } from '../../utils/logger.js';
import { ProductionMockForbiddenError } from '../../../../packages/contracts/src/execution/index.js';


export class MockProvider implements NotificationProvider {
  readonly channel: NotificationChannel;
  readonly name: string;

  private deliveries: Array<{
    request: DeliveryRequest;
    timestamp: Date;
  }> = [];

  constructor(channel: NotificationChannel, name?: string) {
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
    logger.info('Mock delivery', {

      channel: this.channel,
      deliveryId: request.id,
      destination: request.destination,
      title: request.title,
      body: request.body.substring(0, 100)
    });

    // Store for inspection
    this.deliveries.push({
      request,
      timestamp: new Date()
    });

    // Simulate success
    return {
      providerMessageId: `mock-${Date.now()}-${Math.random()}`,
      status: 'accepted',
      metadata: {
        mockDelivery: true
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Get all deliveries (for testing)
   */
  getDeliveries(): typeof this.deliveries {
    return this.deliveries;
  }

  /**
   * Clear delivery history (for testing)
   */
  clear(): void {
    this.deliveries = [];
  }
}
