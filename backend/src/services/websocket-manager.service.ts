/**
 * WebSocket Manager Service
 * Real-time updates for dashboards and monitoring interfaces
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool } from 'pg';

export interface WebSocketClient {
  socketId: string;
  userId: string;
  tenantId: string;
  userScope?: {
    branchIds?: string[];
    regionIds?: string[];
  };
  subscriptions: Set<string>;
  connectedAt: Date;
}

export interface EventPayload {
  type: string;
  data: any;
  timestamp: Date;
  branchId?: string;
  region?: string;
  severity?: string;
}

export class WebSocketManager {
  private io: SocketIOServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private pool: Pool;

  // Channel/room naming conventions
  private readonly CHANNELS = {
    GLOBAL_DASHBOARD: 'global-dashboard',
    BRANCH_HEALTH: 'branch-health',
    ALERTS: 'alerts',
    INCIDENTS: 'incidents',
    CAMERAS: 'cameras',
    STORAGE: 'storage',
    NETWORK: 'network',
    EDGE_AGENTS: 'edge-agents',
    MAP_UPDATES: 'map-updates',
    CENTRAL_MONITORING: 'central-monitoring'
  };

  constructor(httpServer: HTTPServer, pool: Pool) {
    this.pool = pool;
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupConnectionHandlers();
    this.startHeartbeat();
  }

  /**
   * Setup connection and authentication handlers
   */
  private setupConnectionHandlers() {
    this.io.use(async (socket, next) => {
      try {
        // Extract authentication token from handshake
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Validate token and extract user context
        // In production, validate JWT token here
        const userContext = await this.validateToken(token);
        
        if (!userContext) {
          return next(new Error('Invalid authentication token'));
        }

        // Attach user context to socket
        socket.data.userId = userContext.userId;
        socket.data.tenantId = userContext.tenantId;
        socket.data.userScope = userContext.userScope;

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: Socket) {
    const client: WebSocketClient = {
      socketId: socket.id,
      userId: socket.data.userId,
      tenantId: socket.data.tenantId,
      userScope: socket.data.userScope,
      subscriptions: new Set(),
      connectedAt: new Date()
    };

    this.clients.set(socket.id, client);

    console.log(`WebSocket client connected: ${socket.id} (User: ${client.userId}, Tenant: ${client.tenantId})`);

    // Join tenant-specific room
    socket.join(`tenant:${client.tenantId}`);

    // Send initial connection acknowledgment
    socket.emit('connected', {
      socketId: socket.id,
      serverTime: new Date(),
      subscriptions: []
    });

    // Handle subscription requests
    socket.on('subscribe', (channels: string[]) => {
      this.handleSubscribe(socket, client, channels);
    });

    socket.on('unsubscribe', (channels: string[]) => {
      this.handleUnsubscribe(socket, client, channels);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnect(socket.id);
    });

    // Handle client ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });
  }

  /**
   * Handle channel subscription
   */
  private handleSubscribe(socket: Socket, client: WebSocketClient, channels: string[]) {
    channels.forEach(channel => {
      // Validate channel access based on user scope
      if (this.canAccessChannel(client, channel)) {
        const roomName = this.buildRoomName(client.tenantId, channel);
        socket.join(roomName);
        client.subscriptions.add(channel);
      }
    });

    socket.emit('subscribed', {
      channels: Array.from(client.subscriptions),
      timestamp: new Date()
    });

    console.log(`Client ${socket.id} subscribed to: ${Array.from(client.subscriptions).join(', ')}`);
  }

  /**
   * Handle channel unsubscription
   */
  private handleUnsubscribe(socket: Socket, client: WebSocketClient, channels: string[]) {
    channels.forEach(channel => {
      const roomName = this.buildRoomName(client.tenantId, channel);
      socket.leave(roomName);
      client.subscriptions.delete(channel);
    });

    socket.emit('unsubscribed', {
      channels,
      timestamp: new Date()
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnect(socketId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      console.log(`WebSocket client disconnected: ${socketId} (User: ${client.userId})`);
      this.clients.delete(socketId);
    }
  }

  /**
   * Validate authentication token
   */
  private async validateToken(token: string): Promise<any> {
    // TODO: Implement JWT validation
    // For now, return mock data
    // In production, verify JWT signature and extract claims
    try {
      // Decode JWT and extract user context
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // return decoded;
      
      return {
        userId: 'mock-user-id',
        tenantId: 'mock-tenant-id',
        userScope: {}
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if client can access channel
   */
  private canAccessChannel(client: WebSocketClient, channel: string): boolean {
    // If channel is branch-specific, verify access
    if (channel.startsWith('branch:')) {
      const branchId = channel.split(':')[1];
      if (client.userScope?.branchIds && client.userScope.branchIds.length > 0) {
        return client.userScope.branchIds.includes(branchId);
      }
    }

    // If channel is region-specific, verify access
    if (channel.startsWith('region:')) {
      const region = channel.split(':')[1];
      if (client.userScope?.regionIds && client.userScope.regionIds.length > 0) {
        return client.userScope.regionIds.includes(region);
      }
    }

    // Allow global channels for all users in tenant
    return true;
  }

  /**
   * Build room name with tenant prefix
   */
  private buildRoomName(tenantId: string, channel: string): string {
    return `${tenantId}:${channel}`;
  }

  /**
   * Broadcast event to all clients in a channel
   */
  public broadcast(tenantId: string, channel: string, event: EventPayload) {
    const roomName = this.buildRoomName(tenantId, channel);
    this.io.to(roomName).emit('update', event);
  }

  /**
   * Broadcast to specific branch
   */
  public broadcastToBranch(tenantId: string, branchId: string, event: EventPayload) {
    const roomName = this.buildRoomName(tenantId, `branch:${branchId}`);
    this.io.to(roomName).emit('update', event);
  }

  /**
   * Broadcast to specific region
   */
  public broadcastToRegion(tenantId: string, region: string, event: EventPayload) {
    const roomName = this.buildRoomName(tenantId, `region:${region}`);
    this.io.to(roomName).emit('update', event);
  }

  /**
   * Send alert notification
   */
  public sendAlert(tenantId: string, alert: any) {
    const event: EventPayload = {
      type: 'alert',
      data: alert,
      timestamp: new Date(),
      branchId: alert.branchId,
      severity: alert.severity
    };

    this.broadcast(tenantId, this.CHANNELS.ALERTS, event);
    
    // Also send to global dashboard
    this.broadcast(tenantId, this.CHANNELS.GLOBAL_DASHBOARD, event);

    // Send to specific branch channel
    if (alert.branchId) {
      this.broadcastToBranch(tenantId, alert.branchId, event);
    }
  }

  /**
   * Send incident notification
   */
  public sendIncident(tenantId: string, incident: any) {
    const event: EventPayload = {
      type: 'incident',
      data: incident,
      timestamp: new Date(),
      branchId: incident.branchId,
      severity: incident.severity
    };

    this.broadcast(tenantId, this.CHANNELS.INCIDENTS, event);
    this.broadcast(tenantId, this.CHANNELS.GLOBAL_DASHBOARD, event);
    
    if (incident.branchId) {
      this.broadcastToBranch(tenantId, incident.branchId, event);
    }
  }

  /**
   * Send camera status update
   */
  public sendCameraStatusUpdate(tenantId: string, branchId: string, cameraUpdate: any) {
    const event: EventPayload = {
      type: 'camera_status',
      data: cameraUpdate,
      timestamp: new Date(),
      branchId
    };

    this.broadcast(tenantId, this.CHANNELS.CAMERAS, event);
    this.broadcastToBranch(tenantId, branchId, event);
  }

  /**
   * Send branch health update
   */
  public sendBranchHealthUpdate(tenantId: string, branchId: string, healthScore: any) {
    const event: EventPayload = {
      type: 'branch_health',
      data: healthScore,
      timestamp: new Date(),
      branchId
    };

    this.broadcast(tenantId, this.CHANNELS.BRANCH_HEALTH, event);
    this.broadcast(tenantId, this.CHANNELS.GLOBAL_DASHBOARD, event);
    this.broadcastToBranch(tenantId, branchId, event);
    this.broadcast(tenantId, this.CHANNELS.MAP_UPDATES, event);
  }

  /**
   * Send edge agent status update
   */
  public sendEdgeAgentUpdate(tenantId: string, branchId: string, agentStatus: any) {
    const event: EventPayload = {
      type: 'edge_agent_status',
      data: agentStatus,
      timestamp: new Date(),
      branchId
    };

    this.broadcast(tenantId, this.CHANNELS.EDGE_AGENTS, event);
    this.broadcastToBranch(tenantId, branchId, event);
  }

  /**
   * Send storage alert
   */
  public sendStorageAlert(tenantId: string, branchId: string, storageInfo: any) {
    const event: EventPayload = {
      type: 'storage_alert',
      data: storageInfo,
      timestamp: new Date(),
      branchId
    };

    this.broadcast(tenantId, this.CHANNELS.STORAGE, event);
    this.broadcastToBranch(tenantId, branchId, event);
  }

  /**
   * Send network status update
   */
  public sendNetworkUpdate(tenantId: string, branchId: string, networkStatus: any) {
    const event: EventPayload = {
      type: 'network_status',
      data: networkStatus,
      timestamp: new Date(),
      branchId
    };

    this.broadcast(tenantId, this.CHANNELS.NETWORK, event);
    this.broadcastToBranch(tenantId, branchId, event);
  }

  /**
   * Send dashboard metrics update
   */
  public sendDashboardMetrics(tenantId: string, metrics: any) {
    const event: EventPayload = {
      type: 'dashboard_metrics',
      data: metrics,
      timestamp: new Date()
    };

    this.broadcast(tenantId, this.CHANNELS.GLOBAL_DASHBOARD, event);
  }

  /**
   * Send central monitoring event
   */
  public sendCentralMonitoringEvent(tenantId: string, monitoringEvent: any) {
    const event: EventPayload = {
      type: 'central_monitoring',
      data: monitoringEvent,
      timestamp: new Date()
    };

    this.broadcast(tenantId, this.CHANNELS.CENTRAL_MONITORING, event);
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(tenantId?: string): number {
    if (tenantId) {
      return Array.from(this.clients.values()).filter(c => c.tenantId === tenantId).length;
    }
    return this.clients.size;
  }

  /**
   * Get client subscriptions
   */
  public getClientSubscriptions(socketId: string): string[] {
    const client = this.clients.get(socketId);
    return client ? Array.from(client.subscriptions) : [];
  }

  /**
   * Heartbeat to detect stale connections
   */
  private startHeartbeat() {
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, socketId) => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          this.clients.delete(socketId);
          console.log(`Removed stale WebSocket client: ${socketId}`);
        }
      });
    }, 60000); // Check every minute
  }

  /**
   * Graceful shutdown
   */
  public async shutdown() {
    console.log('Shutting down WebSocket server...');
    
    // Notify all clients
    this.io.emit('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date()
    });

    // Close all connections
    this.io.close();
    this.clients.clear();
    
    console.log('WebSocket server shut down complete');
  }

  /**
   * Get server statistics
   */
  public getStatistics() {
    const tenantStats = new Map<string, number>();
    
    this.clients.forEach(client => {
      const count = tenantStats.get(client.tenantId) || 0;
      tenantStats.set(client.tenantId, count + 1);
    });

    return {
      totalConnections: this.clients.size,
      tenantConnections: Object.fromEntries(tenantStats),
      uptime: process.uptime()
    };
  }
}
