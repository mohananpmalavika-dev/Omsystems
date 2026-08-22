/**
 * WebSocket Client
 * Real-time connection manager for dashboard updates
 */

import { io, Socket } from 'socket.io-client';

export interface WebSocketConfig {
  url: string;
  token: string;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export interface RealtimeEvent {
  type: string;
  data: any;
  timestamp: Date;
  branchId?: string;
  region?: string;
  severity?: string;
}

export type EventCallback = (event: RealtimeEvent) => void;

export class WebSocketClient {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private callbacks: Map<string, Set<EventCallback>> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      ...config
    };
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.config.url, {
          auth: {
            token: this.config.token
          },
          transports: ['websocket', 'polling'],
          reconnection: this.config.reconnection,
          reconnectionAttempts: this.config.reconnectionAttempts,
          reconnectionDelay: this.config.reconnectionDelay
        });

        this.socket.on('connected', (data: any) => {
          console.log('WebSocket connected:', data);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error: Error) => {
          console.error('WebSocket connection error:', error);
          this.isConnected = false;
          this.reconnectAttempts++;
          
          if (this.reconnectAttempts >= (this.config.reconnectionAttempts || 5)) {
            reject(error);
          }
        });

        this.socket.on('disconnect', (reason: string) => {
          console.log('WebSocket disconnected:', reason);
          this.isConnected = false;
        });

        this.socket.on('update', (event: RealtimeEvent) => {
          this.handleEvent(event);
        });

        this.socket.on('server_shutdown', (data: any) => {
          console.warn('Server shutting down:', data);
          this.isConnected = false;
        });

        // Handle reconnection
        this.socket.on('reconnect', (attemptNumber: number) => {
          console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Subscribe to channels
   */
  public subscribe(channels: string[]): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('subscribe', channels);
    }
  }

  /**
   * Unsubscribe from channels
   */
  public unsubscribe(channels: string[]): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('unsubscribe', channels);
    }
  }

  /**
   * Register event callback
   */
  public on(eventType: string, callback: EventCallback): void {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, new Set());
    }
    this.callbacks.get(eventType)!.add(callback);
  }

  /**
   * Unregister event callback
   */
  public off(eventType: string, callback: EventCallback): void {
    const callbacks = this.callbacks.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Handle incoming event
   */
  private handleEvent(event: RealtimeEvent): void {
    // Call type-specific callbacks
    const typeCallbacks = this.callbacks.get(event.type);
    if (typeCallbacks) {
      typeCallbacks.forEach(callback => callback(event));
    }

    // Call wildcard callbacks
    const wildcardCallbacks = this.callbacks.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach(callback => callback(event));
    }
  }

  /**
   * Check connection status
   */
  public get connected(): boolean {
    return this.isConnected && this.socket !== null && this.socket.connected;
  }

  /**
   * Send ping to server
   */
  public ping(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('ping');
    }
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

/**
 * Initialize WebSocket client
 */
export function initializeWebSocket(config: WebSocketConfig): Promise<WebSocketClient> {
  if (!wsClient) {
    wsClient = new WebSocketClient(config);
    return wsClient.connect().then(() => wsClient!);
  }
  return Promise.resolve(wsClient);
}

/**
 * Get WebSocket client instance
 */
export function getWebSocketClient(): WebSocketClient | null {
  return wsClient;
}

/**
 * Close WebSocket connection
 */
export function closeWebSocket(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}
