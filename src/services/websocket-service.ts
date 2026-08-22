/**
 * WebSocket Service for Real-Time Updates
 * Provides real-time health monitoring, alert notifications, and system events
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { ControlPlaneStore } from '../control-plane-store.js';

export interface HealthUpdate {
  type: 'camera' | 'storage' | 'network' | 'ups';
  assetId: string;
  assetName: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  metrics: Record<string, any>;
  timestamp: Date;
}

export interface AlertUpdate {
  alertId: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  source: string;
  status: 'active' | 'acknowledged' | 'resolved';
  timestamp: Date;
}

export interface WorkOrderUpdate {
  workOrderId: string;
  workOrderNumber: string;
  status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'cancelled';
  assignedTo?: string;
  timestamp: Date;
}

export class WebSocketService {
  private io: SocketIOServer;
  private store: ControlPlaneStore;
  private logger: any;
  private connectedClients: Map<string, Set<string>> = new Map(); // tenantId -> Set of socketIds

  constructor(httpServer: HTTPServer, store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;

    // Initialize Socket.IO
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/ws',
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.logger.info('WebSocket service initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected:', socket.id);

      // Authentication - client should send tenantId after connection
      socket.on('authenticate', (data: { tenantId: string; userId: string }) => {
        const { tenantId, userId } = data;

        // Store connection mapping
        if (!this.connectedClients.has(tenantId)) {
          this.connectedClients.set(tenantId, new Set());
        }
        this.connectedClients.get(tenantId)!.add(socket.id);

        // Join tenant-specific room
        socket.join(`tenant:${tenantId}`);
        socket.data.tenantId = tenantId;
        socket.data.userId = userId;

        this.logger.info('Client authenticated:', {
          socketId: socket.id,
          tenantId,
          userId,
        });

        socket.emit('authenticated', { success: true });
      });

      // Subscribe to specific channels
      socket.on('subscribe', (channel: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:${channel}`);
        this.logger.info('Client subscribed:', {
          socketId: socket.id,
          channel,
        });

        socket.emit('subscribed', { channel });
      });

      // Unsubscribe from channels
      socket.on('unsubscribe', (channel: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) return;

        socket.leave(`${tenantId}:${channel}`);
        this.logger.info('Client unsubscribed:', {
          socketId: socket.id,
          channel,
        });

        socket.emit('unsubscribed', { channel });
      });

      // Request current health status
      socket.on('request-health-status', async () => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        try {
          // Fetch current health data
          const healthData = await this.getCurrentHealthStatus(tenantId);
          socket.emit('health-status', healthData);
        } catch (error) {
          this.logger.error('Failed to fetch health status:', error);
          socket.emit('error', { message: 'Failed to fetch health status' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        const tenantId = socket.data.tenantId;
        if (tenantId) {
          const clients = this.connectedClients.get(tenantId);
          if (clients) {
            clients.delete(socket.id);
            if (clients.size === 0) {
              this.connectedClients.delete(tenantId);
            }
          }
        }

        this.logger.info('Client disconnected:', socket.id);
      });
    });
  }

  /**
   * Broadcast health update to all connected clients in tenant
   */
  broadcastHealthUpdate(tenantId: string, update: HealthUpdate) {
    this.io.to(`tenant:${tenantId}`).emit('health-update', update);
    this.io.to(`${tenantId}:health`).emit('health-update', update);
    
    this.logger.debug('Health update broadcasted:', {
      tenantId,
      type: update.type,
      assetId: update.assetId,
      status: update.status,
    });
  }

  /**
   * Broadcast alert to all connected clients in tenant
   */
  broadcastAlert(tenantId: string, alert: AlertUpdate) {
    this.io.to(`tenant:${tenantId}`).emit('alert', alert);
    this.io.to(`${tenantId}:alerts`).emit('alert', alert);
    
    this.logger.info('Alert broadcasted:', {
      tenantId,
      alertId: alert.alertId,
      severity: alert.severity,
      category: alert.category,
    });
  }

  /**
   * Broadcast work order update
   */
  broadcastWorkOrderUpdate(tenantId: string, update: WorkOrderUpdate) {
    this.io.to(`tenant:${tenantId}`).emit('work-order-update', update);
    this.io.to(`${tenantId}:work-orders`).emit('work-order-update', update);
    
    this.logger.debug('Work order update broadcasted:', {
      tenantId,
      workOrderId: update.workOrderId,
      status: update.status,
    });
  }

  /**
   * Broadcast system event
   */
  broadcastSystemEvent(tenantId: string, event: { type: string; message: string; data?: any }) {
    this.io.to(`tenant:${tenantId}`).emit('system-event', event);
    
    this.logger.info('System event broadcasted:', {
      tenantId,
      type: event.type,
      message: event.message,
    });
  }

  /**
   * Send message to specific user
   */
  sendToUser(tenantId: string, userId: string, event: string, data: any) {
    // Find all sockets for this user
    const clients = this.connectedClients.get(tenantId);
    if (!clients) return;

    for (const socketId of clients) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.data.userId === userId) {
        socket.emit(event, data);
      }
    }

    this.logger.debug('Message sent to user:', {
      tenantId,
      userId,
      event,
    });
  }

  /**
   * Get current health status from database
   */
  private async getCurrentHealthStatus(tenantId: string): Promise<any> {
    // This would fetch current health data from the database
    // For now, return a placeholder
    return {
      timestamp: new Date(),
      cameras: {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        offline: 0,
      },
      storage: {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
      },
      alerts: {
        active: 0,
        critical: 0,
        warning: 0,
      },
    };
  }

  /**
   * Get connected client count for tenant
   */
  getConnectedClientCount(tenantId: string): number {
    const clients = this.connectedClients.get(tenantId);
    return clients ? clients.size : 0;
  }

  /**
   * Get all connected tenants
   */
  getConnectedTenants(): string[] {
    return Array.from(this.connectedClients.keys());
  }

  /**
   * Disconnect all clients for a tenant
   */
  disconnectTenant(tenantId: string) {
    const clients = this.connectedClients.get(tenantId);
    if (!clients) return;

    for (const socketId of clients) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }

    this.connectedClients.delete(tenantId);
    this.logger.info('All clients disconnected for tenant:', tenantId);
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown() {
    this.logger.info('Shutting down WebSocket service...');
    
    // Disconnect all clients
    for (const tenantId of this.connectedClients.keys()) {
      this.disconnectTenant(tenantId);
    }

    // Close Socket.IO server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        this.logger.info('WebSocket service shut down');
        resolve();
      });
    });
  }
}

// Singleton instance
let webSocketServiceInstance: WebSocketService | null = null;

export function initWebSocketService(
  httpServer: HTTPServer,
  store: ControlPlaneStore,
  logger?: any
): WebSocketService {
  if (!webSocketServiceInstance) {
    webSocketServiceInstance = new WebSocketService(httpServer, store, logger);
  }
  return webSocketServiceInstance;
}

export function getWebSocketService(): WebSocketService | null {
  return webSocketServiceInstance;
}
