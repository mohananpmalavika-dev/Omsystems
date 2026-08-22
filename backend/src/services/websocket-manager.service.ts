/**
 * WebSocket Manager Service
 * Real-time updates for dashboards and monitoring interfaces
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool } from 'pg';
import { verify } from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface WebSocketClient {
  socketId: string;
  userId: string;
  tenantId: string;
  username: string;
  email: string;
  role: string;
  userScope?: {
    branchIds?: string[];
    regionIds?: string[];
  };
  subscriptions: Set<string>;
  connectedAt: Date;
}

export interface JWTPayload {
  globalUserId?: string;
  userId?: string;
  tenantId: string;
  username: string;
  email: string;
  role: string;
  canAccessAllRegions?: boolean;
  accessibleRegions?: string[];
  sessionId?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
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
  private jwtSecret: string;
  private readonly JWT_ISSUER = process.env.JWT_ISSUER || 'sentinel-grid';
  private readonly JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'sentinel-grid-api';

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

  constructor(httpServer: HTTPServer, pool: Pool, jwtSecret?: string) {
    this.pool = pool;
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || process.env.FEDERATION_JWT_SECRET || '';

    if (!this.jwtSecret) {
      logger.error('JWT_SECRET not configured for WebSocket authentication');
      throw new Error('JWT_SECRET is required for WebSocket authentication');
    }
    
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
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          logger.warn('WebSocket connection attempt without token', {
            socketId: socket.id,
            ip: socket.handshake.address
          });
          return next(new Error('Authentication token required'));
        }

        // Validate token and extract user context
        const userContext = await this.validateToken(token);
        
        if (!userContext) {
          logger.warn('WebSocket connection attempt with invalid token', {
            socketId: socket.id,
            ip: socket.handshake.address
          });
          return next(new Error('Invalid or expired authentication token'));
        }

        // Verify user permissions from database
        const userPermissions = await this.loadUserPermissions(
          userContext.userId,
          userContext.tenantId
        );

        if (!userPermissions) {
          logger.warn('WebSocket connection denied - user not found or inactive', {
            userId: userContext.userId,
            tenantId: userContext.tenantId,
            socketId: socket.id
          });
          return next(new Error('User not found or account inactive'));
        }

        // Attach validated user context to socket
        socket.data.userId = userContext.userId;
        socket.data.tenantId = userContext.tenantId;
        socket.data.username = userContext.username;
        socket.data.email = userContext.email;
        socket.data.role = userContext.role;
        socket.data.userScope = userPermissions.userScope;

        logger.info('WebSocket authentication successful', {
          socketId: socket.id,
          userId: userContext.userId,
          tenantId: userContext.tenantId,
          role: userContext.role
        });

        next();
      } catch (error) {
        logger.error('WebSocket authentication error', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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
      username: socket.data.username,
      email: socket.data.email,
      role: socket.data.role,
      userScope: socket.data.userScope,
      subscriptions: new Set(),
      connectedAt: new Date()
    };

    this.clients.set(socket.id, client);

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId: client.userId,
      tenantId: client.tenantId,
      role: client.role
    });

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
    const allowedChannels: string[] = [];

    channels.forEach(channel => {
      // Validate channel access based on user scope
      if (this.canAccessChannel(client, channel)) {
        const roomName = this.buildRoomName(client.tenantId, channel);
        socket.join(roomName);
        client.subscriptions.add(channel);
        allowedChannels.push(channel);
      } else {
        logger.warn('Channel subscription denied', {
          socketId: socket.id,
          userId: client.userId,
          channel,
          role: client.role
        });
      }
    });

    socket.emit('subscribed', {
      channels: allowedChannels,
      timestamp: new Date()
    });

    logger.info('Client subscribed to channels', {
      socketId: socket.id,
      userId: client.userId,
      channels: allowedChannels
    });
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
      logger.info('WebSocket client disconnected', {
        socketId,
        userId: client.userId,
        tenantId: client.tenantId
      });
      this.clients.delete(socketId);
    }
  }

  /**
   * Validate authentication token with comprehensive security checks
   */
  private async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      // Verify JWT signature and decode
      const decoded = verify(token, this.jwtSecret, {
        algorithms: ['HS256', 'HS384', 'HS512'], // Only allow HMAC algorithms
        issuer: this.JWT_ISSUER,
        audience: this.JWT_AUDIENCE,
        clockTolerance: 30 // Allow 30 seconds clock skew
      }) as JWTPayload;

      // Validate required fields
      if (!decoded.userId && !decoded.globalUserId) {
        logger.warn('JWT missing user identifier');
        return null;
      }

      if (!decoded.tenantId) {
        logger.warn('JWT missing tenant identifier');
        return null;
      }

      if (!decoded.username || !decoded.email) {
        logger.warn('JWT missing user metadata');
        return null;
      }

      if (!decoded.role) {
        logger.warn('JWT missing role');
        return null;
      }

      // Validate expiry (jwt.verify already checks this, but double-check)
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        logger.warn('JWT expired', {
          exp: new Date(decoded.exp * 1000),
          now: new Date()
        });
        return null;
      }

      // If session ID is present, verify session is still valid in database
      if (decoded.sessionId) {
        const sessionValid = await this.verifySessionInDatabase(decoded.sessionId);
        if (!sessionValid) {
          logger.warn('JWT session revoked or expired', {
            sessionId: decoded.sessionId
          });
          return null;
        }
      }

      // Normalize user ID (support both global and local user IDs)
      const userId = decoded.userId || decoded.globalUserId!;

      return {
        ...decoded,
        userId
      };

    } catch (error) {
      if (error instanceof Error) {
        logger.warn('JWT validation failed', {
          error: error.name,
          message: error.message
        });
      }
      return null;
    }
  }

  /**
   * Verify session is still valid in database
   */
  private async verifySessionInDatabase(sessionId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT expires_at, revoked_at
         FROM global_user_sessions
         WHERE id = $1::uuid`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const session = result.rows[0];

      // Check if session is revoked
      if (session.revoked_at) {
        return false;
      }

      // Check if session has expired
      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Session verification failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Load user permissions and scope from database
   */
  private async loadUserPermissions(
    userId: string,
    tenantId: string
  ): Promise<{
    userScope: {
      branchIds?: string[];
      regionIds?: string[];
    };
  } | null> {
    try {
      // Check if user exists and is active
      const userResult = await this.pool.query(
        `SELECT 
          id,
          status,
          role
         FROM users
         WHERE id = $1::uuid
           AND tenant_id = $2::uuid`,
        [userId, tenantId]
      );

      if (userResult.rows.length === 0) {
        logger.warn('User not found for WebSocket connection', {
          userId,
          tenantId
        });
        return null;
      }

      const user = userResult.rows[0];

      if (user.status !== 'active') {
        logger.warn('Inactive user attempted WebSocket connection', {
          userId,
          tenantId,
          status: user.status
        });
        return null;
      }

      // Load user's accessible branches
      const branchResult = await this.pool.query(
        `SELECT DISTINCT b.id::text as branch_id
         FROM branches b
         INNER JOIN user_branch_assignments uba ON uba.branch_id = b.id
         WHERE uba.user_id = $1::uuid
           AND b.tenant_id = $2::uuid
           AND b.status = 'active'`,
        [userId, tenantId]
      );

      const branchIds = branchResult.rows.map(row => row.branch_id);

      // Load user's accessible regions
      const regionResult = await this.pool.query(
        `SELECT DISTINCT b.region::text as region
         FROM branches b
         INNER JOIN user_branch_assignments uba ON uba.branch_id = b.id
         WHERE uba.user_id = $1::uuid
           AND b.tenant_id = $2::uuid
           AND b.region IS NOT NULL`,
        [userId, tenantId]
      );

      const regionIds = regionResult.rows.map(row => row.region);

      // Check if user has global access (super_admin, company_admin)
      const hasGlobalAccess = ['super_admin', 'company_admin', 'hq_admin'].includes(user.role);

      return {
        userScope: {
          branchIds: hasGlobalAccess ? undefined : branchIds,
          regionIds: hasGlobalAccess ? undefined : regionIds
        }
      };

    } catch (error) {
      logger.error('Failed to load user permissions', {
        userId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if client can access channel with comprehensive permission validation
   */
  private canAccessChannel(client: WebSocketClient, channel: string): boolean {
    // Global admins can access all channels within their tenant
    const globalRoles = ['super_admin', 'company_admin', 'hq_admin'];
    const isGlobalAdmin = globalRoles.includes(client.role);

    // Branch-specific channels require branch access
    if (channel.startsWith('branch:')) {
      const branchId = channel.split(':')[1];
      
      if (!branchId) {
        logger.warn('Invalid branch channel format', { channel });
        return false;
      }

      // Global admins can access all branches
      if (isGlobalAdmin) {
        return true;
      }

      // Check if user has access to this specific branch
      if (client.userScope?.branchIds && client.userScope.branchIds.length > 0) {
        return client.userScope.branchIds.includes(branchId);
      }

      // No branch access - deny
      return false;
    }

    // Region-specific channels require region access
    if (channel.startsWith('region:')) {
      const region = channel.split(':')[1];
      
      if (!region) {
        logger.warn('Invalid region channel format', { channel });
        return false;
      }

      // Global admins can access all regions
      if (isGlobalAdmin) {
        return true;
      }

      // Check if user has access to this specific region
      if (client.userScope?.regionIds && client.userScope.regionIds.length > 0) {
        return client.userScope.regionIds.includes(region);
      }

      // No region access - deny
      return false;
    }

    // Camera-specific channels require camera/branch access
    if (channel.startsWith('camera:')) {
      const cameraId = channel.split(':')[1];
      
      if (!cameraId) {
        logger.warn('Invalid camera channel format', { channel });
        return false;
      }

      // Global admins can access all cameras
      if (isGlobalAdmin) {
        return true;
      }

      // For camera channels, we need to verify branch access
      // This is a simplified check - in production, you'd query the camera's branch
      // For now, allow if user has any branch access
      return (client.userScope?.branchIds?.length ?? 0) > 0;
    }

    // Global channels - check role-based access
    const roleBasedChannels: Record<string, string[]> = {
      [this.CHANNELS.GLOBAL_DASHBOARD]: globalRoles,
      [this.CHANNELS.CENTRAL_MONITORING]: globalRoles,
      [this.CHANNELS.ALERTS]: [...globalRoles, 'region_manager', 'branch_manager', 'security_officer'],
      [this.CHANNELS.INCIDENTS]: [...globalRoles, 'region_manager', 'branch_manager', 'security_officer'],
      [this.CHANNELS.CAMERAS]: [...globalRoles, 'region_manager', 'branch_manager', 'security_officer', 'operator'],
      [this.CHANNELS.BRANCH_HEALTH]: [...globalRoles, 'region_manager', 'branch_manager'],
      [this.CHANNELS.STORAGE]: [...globalRoles, 'region_manager', 'branch_manager', 'it_admin'],
      [this.CHANNELS.NETWORK]: [...globalRoles, 'region_manager', 'branch_manager', 'it_admin'],
      [this.CHANNELS.EDGE_AGENTS]: [...globalRoles, 'region_manager', 'branch_manager', 'it_admin'],
      [this.CHANNELS.MAP_UPDATES]: [...globalRoles, 'region_manager', 'branch_manager', 'security_officer', 'operator']
    };

    // Check if this is a known global channel
    const allowedRoles = roleBasedChannels[channel];
    
    if (allowedRoles) {
      return allowedRoles.includes(client.role);
    }

    // Unknown channel - deny by default (fail closed)
    logger.warn('Access denied to unknown channel', {
      channel,
      userId: client.userId,
      role: client.role
    });
    return false;
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
          logger.debug('Removed stale WebSocket client', { socketId });
        }
      });
    }, 60000); // Check every minute
  }

  /**
   * Graceful shutdown
   */
  public async shutdown() {
    logger.info('Shutting down WebSocket server...');
    
    // Notify all clients
    this.io.emit('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date()
    });

    // Close all connections
    this.io.close();
    this.clients.clear();
    
    logger.info('WebSocket server shut down complete');
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
