/**
 * Digital Twin WebSocket Manager
 * 
 * Manages WebSocket connections for real-time digital twin updates.
 */

import { Server as WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { TwinEventPayload } from './twin-event-handler.js';

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  userId?: string;
  tenantId?: string;
}

export interface TwinUpdateMessage {
  type: 'twin.updated' | 'twin.topology_changed' | 'twin.blast_radius' | 'twin.health_changed';
  timestamp: string;
  data: any;
}

/**
 * WebSocket manager for broadcasting digital twin updates
 */
export class TwinWebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // assetId -> Set<clientId>

  constructor(private eventHandler: EventEmitter) {
    this.setupEventListeners();
  }

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer, path: string = '/ws/digital-twin'): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path
    });

    this.wss.on('connection', (socket, request) => {
      this.handleConnection(socket, request);
    });

    console.log(`[TwinWebSocket] WebSocket server initialized on ${path}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      userId: this.extractUserId(request),
      tenantId: this.extractTenantId(request)
    };

    this.clients.set(clientId, client);

    console.log(`[TwinWebSocket] Client ${clientId} connected (total: ${this.clients.size})`);

    // Send welcome message
    this.sendToClient(client, {
      type: 'twin.updated',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Connected to Digital Twin updates',
        clientId
      }
    });

    // Handle messages from client
    socket.on('message', (message) => {
      this.handleClientMessage(client, message);
    });

    // Handle disconnect
    socket.on('close', () => {
      this.handleDisconnect(client);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[TwinWebSocket] Client ${clientId} error:`, error);
    });
  }

  /**
   * Handle message from client
   */
  private handleClientMessage(client: WebSocketClient, message: any): void {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(client, data.assetIds || []);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, data.assetIds || []);
          break;

        case 'ping':
          this.sendToClient(client, {
            type: 'twin.updated',
            timestamp: new Date().toISOString(),
            data: { pong: true }
          });
          break;

        default:
          console.warn(`[TwinWebSocket] Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('[TwinWebSocket] Error handling client message:', error);
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(client: WebSocketClient, assetIds: string[]): void {
    for (const assetId of assetIds) {
      client.subscriptions.add(assetId);

      if (!this.subscriptions.has(assetId)) {
        this.subscriptions.set(assetId, new Set());
      }
      this.subscriptions.get(assetId)!.add(client.id);
    }

    this.sendToClient(client, {
      type: 'twin.updated',
      timestamp: new Date().toISOString(),
      data: {
        subscribed: assetIds,
        totalSubscriptions: client.subscriptions.size
      }
    });

    console.log(`[TwinWebSocket] Client ${client.id} subscribed to ${assetIds.length} assets`);
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: WebSocketClient, assetIds: string[]): void {
    for (const assetId of assetIds) {
      client.subscriptions.delete(assetId);

      const subscribers = this.subscriptions.get(assetId);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.subscriptions.delete(assetId);
        }
      }
    }

    this.sendToClient(client, {
      type: 'twin.updated',
      timestamp: new Date().toISOString(),
      data: {
        unsubscribed: assetIds,
        totalSubscriptions: client.subscriptions.size
      }
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: WebSocketClient): void {
    // Remove from subscriptions
    for (const assetId of client.subscriptions) {
      const subscribers = this.subscriptions.get(assetId);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.subscriptions.delete(assetId);
        }
      }
    }

    this.clients.delete(client.id);

    console.log(`[TwinWebSocket] Client ${client.id} disconnected (remaining: ${this.clients.size})`);
  }

  /**
   * Setup event listeners for twin updates
   */
  private setupEventListeners(): void {
    this.eventHandler.on('twin.updated', (payload: TwinEventPayload) => {
      this.broadcastUpdate({
        type: 'twin.updated',
        timestamp: new Date().toISOString(),
        data: payload
      });
    });

    this.eventHandler.on('twin.topology_changed', (data: any) => {
      this.broadcastToAll({
        type: 'twin.topology_changed',
        timestamp: new Date().toISOString(),
        data
      });
    });

    this.eventHandler.on('twin.blast_radius_calculated', (data: any) => {
      this.broadcastUpdate({
        type: 'twin.blast_radius',
        timestamp: new Date().toISOString(),
        data
      });
    });
  }

  /**
   * Broadcast update to subscribed clients
   */
  private broadcastUpdate(message: TwinUpdateMessage): void {
    const assetId = message.data.assetId;
    if (!assetId) {
      return;
    }

    const subscribers = this.subscriptions.get(assetId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    let sent = 0;
    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && this.sendToClient(client, message)) {
        sent++;
      }
    }

    console.log(`[TwinWebSocket] Broadcast update for ${assetId} to ${sent} clients`);
  }

  /**
   * Broadcast to all connected clients
   */
  private broadcastToAll(message: TwinUpdateMessage): void {
    let sent = 0;
    
    for (const client of this.clients.values()) {
      if (this.sendToClient(client, message)) {
        sent++;
      }
    }

    console.log(`[TwinWebSocket] Broadcast to all: ${sent}/${this.clients.size} clients`);
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocketClient, message: TwinUpdateMessage): boolean {
    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify(message));
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[TwinWebSocket] Error sending to client ${client.id}:`, error);
      return false;
    }
  }

  /**
   * Broadcast topology update
   */
  broadcastTopologyUpdate(rootId: string, change: any): void {
    this.broadcastToAll({
      type: 'twin.topology_changed',
      timestamp: new Date().toISOString(),
      data: {
        rootId,
        change
      }
    });
  }

  /**
   * Broadcast blast radius calculation
   */
  broadcastBlastRadius(assetId: string, blastRadius: any): void {
    this.broadcastUpdate({
      type: 'twin.blast_radius',
      timestamp: new Date().toISOString(),
      data: {
        assetId,
        blastRadius
      }
    });
  }

  /**
   * Get statistics
   */
  getStats(): {
    connectedClients: number;
    totalSubscriptions: number;
    uniqueAssets: number;
  } {
    let totalSubscriptions = 0;
    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
    }

    return {
      connectedClients: this.clients.size,
      totalSubscriptions,
      uniqueAssets: this.subscriptions.size
    };
  }

  /**
   * Close all connections
   */
  close(): void {
    for (const client of this.clients.values()) {
      client.socket.close();
    }
    
    if (this.wss) {
      this.wss.close();
    }

    this.clients.clear();
    this.subscriptions.clear();

    console.log('[TwinWebSocket] WebSocket server closed');
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract user ID from request (implement based on your auth)
   */
  private extractUserId(request: any): string | undefined {
    // TODO: Extract from JWT token or session
    return request.headers['x-user-id'];
  }

  /**
   * Extract tenant ID from request (implement based on your auth)
   */
  private extractTenantId(request: any): string | undefined {
    // TODO: Extract from JWT token or session
    return request.headers['x-tenant-id'];
  }
}
