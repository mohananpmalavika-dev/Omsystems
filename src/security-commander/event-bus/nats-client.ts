/**
 * NATS Client
 * Connection and message handling for NATS event bus
 */

import { connect, NatsConnection, Subscription, StringCodec, JSONCodec } from 'nats';
import type { EventBusMessage, EventHandler, SubscriptionConfig, EventBusStats } from './event-bus.types';

const jsonCodec = JSONCodec();

export class NatsClient {
  private connection: NatsConnection | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private stats: EventBusStats = {
    messagesReceived: 0,
    messagesProcessed: 0,
    messagesFailed: 0,
    averageProcessingTime: 0,
    subscriptions: [],
  };

  constructor(
    private readonly servers: string[] = ['nats://localhost:4222'],
    private readonly options: {
      maxReconnectAttempts?: number;
      reconnectTimeWait?: number;
      name?: string;
    } = {}
  ) {}

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    try {
      this.connection = await connect({
        servers: this.servers,
        maxReconnectAttempts: this.options.maxReconnectAttempts ?? -1, // Infinite reconnects
        reconnectTimeWait: this.options.reconnectTimeWait ?? 2000,
        name: this.options.name ?? 'security-commander',
      });

      console.log(`[NATS] Connected to ${this.connection.getServer()}`);

      // Handle connection events
      (async () => {
        if (this.connection) {
          for await (const status of this.connection.status()) {
            console.log(`[NATS] Status: ${status.type}`, status.data);
          }
        }
      })();
    } catch (error) {
      console.error('[NATS] Connection failed:', error);
      throw new Error(`Failed to connect to NATS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subscribe to event subject
   */
  async subscribe<T = any>(
    config: SubscriptionConfig,
    handler: EventHandler<T>
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected to NATS');
    }

    const subscriptionKey = `${config.subject}:${config.queue || 'default'}`;

    // Check if already subscribed
    if (this.subscriptions.has(subscriptionKey)) {
      console.warn(`[NATS] Already subscribed to ${subscriptionKey}`);
      return subscriptionKey;
    }

    try {
      const subscription = this.connection.subscribe(config.subject, {
        queue: config.queue,
      });

      this.subscriptions.set(subscriptionKey, subscription);

      // Process messages
      (async () => {
        for await (const msg of subscription) {
          this.stats.messagesReceived++;
          const startTime = Date.now();

          try {
            // Decode message
            const rawData = jsonCodec.decode(msg.data);
            
            // Wrap in EventBusMessage if not already wrapped
            const eventMessage: EventBusMessage<T> = this.isEventBusMessage(rawData)
              ? rawData
              : {
                  id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  subject: msg.subject,
                  timestamp: new Date(),
                  source: 'unknown',
                  data: rawData as T,
                };

            // Call handler
            await handler(eventMessage);

            // Acknowledge message
            msg.respond();

            this.stats.messagesProcessed++;
            const processingTime = Date.now() - startTime;
            
            // Update average processing time
            this.stats.averageProcessingTime = 
              (this.stats.averageProcessingTime * (this.stats.messagesProcessed - 1) + processingTime) / 
              this.stats.messagesProcessed;

          } catch (error) {
            this.stats.messagesFailed++;
            console.error(`[NATS] Error processing message on ${msg.subject}:`, error);
            
            // Optionally: publish to dead letter queue
            if (this.connection) {
              try {
                await this.publish('security.dlq', {
                  originalSubject: msg.subject,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  data: msg.data,
                  timestamp: new Date(),
                });
              } catch (dlqError) {
                console.error('[NATS] Failed to publish to DLQ:', dlqError);
              }
            }
          }
        }
      })();

      console.log(`[NATS] Subscribed to ${config.subject}${config.queue ? ` (queue: ${config.queue})` : ''}`);
      return subscriptionKey;

    } catch (error) {
      console.error(`[NATS] Subscription failed for ${config.subject}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from subject
   */
  async unsubscribe(subscriptionKey: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (subscription) {
      await subscription.drain();
      this.subscriptions.delete(subscriptionKey);
      console.log(`[NATS] Unsubscribed from ${subscriptionKey}`);
    }
  }

  /**
   * Publish event to subject
   */
  async publish<T = any>(subject: string, data: T): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NATS');
    }

    try {
      const message: EventBusMessage<T> = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subject,
        timestamp: new Date(),
        source: 'security-commander',
        data,
      };

      this.connection.publish(subject, jsonCodec.encode(message));
      console.log(`[NATS] Published to ${subject}`);
    } catch (error) {
      console.error(`[NATS] Publish failed for ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Request-reply pattern
   */
  async request<TRequest = any, TResponse = any>(
    subject: string,
    data: TRequest,
    timeout: number = 5000
  ): Promise<EventBusMessage<TResponse>> {
    if (!this.connection) {
      throw new Error('Not connected to NATS');
    }

    try {
      const message: EventBusMessage<TRequest> = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subject,
        timestamp: new Date(),
        source: 'security-commander',
        data,
      };

      const response = await this.connection.request(
        subject,
        jsonCodec.encode(message),
        { timeout }
      );

      return jsonCodec.decode(response.data) as EventBusMessage<TResponse>;
    } catch (error) {
      console.error(`[NATS] Request failed for ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStats(): EventBusStats {
    return {
      ...this.stats,
      subscriptions: Array.from(this.subscriptions.entries()).map(([key, sub]) => ({
        subject: key.split(':')[0],
        queue: key.split(':')[1] !== 'default' ? key.split(':')[1] : undefined,
        messageCount: sub.getProcessed(),
        lastMessage: undefined, // Would need to track this separately
      })),
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      // Drain all subscriptions
      await Promise.all(
        Array.from(this.subscriptions.values()).map(sub => sub.drain())
      );
      
      // Close connection
      await this.connection.drain();
      await this.connection.close();
      
      this.connection = null;
      this.subscriptions.clear();
      
      console.log('[NATS] Disconnected');
    }
  }

  /**
   * Type guard to check if data is EventBusMessage
   */
  private isEventBusMessage(data: any): data is EventBusMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      'subject' in data &&
      'timestamp' in data &&
      'source' in data &&
      'data' in data
    );
  }
}
