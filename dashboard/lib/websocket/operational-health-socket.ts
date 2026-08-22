/**
 * Operational Health WebSocket Client
 * 
 * Real-time WebSocket connection for branch health updates.
 * Automatically reconnects and handles connection lifecycle.
 */

import { BranchMosaicItem } from '../../types/operational-health.types';

export interface HealthChangeEvent {
  type: 'BRANCH_HEALTH_CHANGED';
  eventType: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  previousState: string;
  newState: string;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
  reasonCodesAdded: string[];
  reasonCodesRemoved: string[];
  currentReasonCodes: string[];
  occurredAt: string;
  data: any;
}

export type HealthChangeCallback = (event: HealthChangeEvent) => void;

export class OperationalHealthSocket {
  private ws: WebSocket | null = null;
  private callbacks: Set<HealthChangeCallback> = new Set();
  private reconnectTimeout?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(private wsUrl: string) {}

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('Operational health WebSocket connected');
        this.reconnectAttempts = 0;

        // Subscribe to operational-health channel
        this.send({
          type: 'SUBSCRIBE',
          channel: 'operational-health',
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'BRANCH_HEALTH_CHANGED') {
            this.notifyCallbacks(message as HealthChangeEvent);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to health change events
   */
  subscribe(callback: HealthChangeCallback) {
    this.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Send message to WebSocket server
   */
  private send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Notify all callbacks of health change event
   */
  private notifyCallbacks(event: HealthChangeEvent) {
    this.callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in health change callback:', error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max WebSocket reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

/**
 * Singleton WebSocket instance
 */
let socketInstance: OperationalHealthSocket | null = null;

export function getOperationalHealthSocket(): OperationalHealthSocket {
  if (!socketInstance) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                  (typeof window !== 'undefined' 
                    ? `ws://${window.location.host}/ws`
                    : 'ws://localhost:3000/ws');
    
    socketInstance = new OperationalHealthSocket(wsUrl);
  }
  return socketInstance;
}
