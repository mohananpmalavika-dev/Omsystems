/**
 * WebSocket Service for Real-Time Updates
 * Provides real-time health monitoring, alert notifications, and system events
 */

import { Server as SocketIOServer } from 'socket.io';
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;
import { createHash } from 'crypto';
import type { Server as HTTPServer } from 'http';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { CommunicationSignalingGateway } from '../communications/gateways/signaling.gateway.js';

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

export interface VideoWallDispatchEvent {
  displayCode: string;
  layout: string;
  assignedCameras: string[];
  dispatchedBy?: string;
  reason?: string;
  timestamp: string;
}

export interface CameraAnnotationEvent {
  id: string;
  cameraId: string;
  flagType: string;
  label: string;
  note: string;
  authorName: string;
  priority?: string;
  pinned: boolean;
  createdAt: string;
  action: 'create' | 'update' | 'resolve';
}

export interface CameraInterventionEvent {
  id: string;
  cameraId: string;
  type: 'siren' | 'strobe' | 'floodlight' | 'door_unlock' | 'all_clear';
  state: 'active' | 'completed' | 'cancelled';
  durationSeconds?: number;
  triggeredBy: string;
  reason?: string;
  timestamp: string;
  expiresAt?: string;
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

    this.io.use(async (socket, next) => {
      let token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
      if (!token && typeof socket.handshake.headers?.cookie === 'string') {
        const parsedCookies = Object.fromEntries(
          socket.handshake.headers.cookie.split(';').map((c) => {
            const [k, ...v] = c.trim().split('=');
            try {
              return [k, decodeURIComponent(v.join('='))];
            } catch {
              return [k, ''];
            }
          })
        );
        token = parsedCookies['sentinel_access'] || parsedCookies['sentinel_session'] || parsedCookies['accessToken'] || '';
      }

      if (!token) return next(new Error('unauthorized'));

      // 1. Try Device Token (JWT signed with COMM_DEVICE_TOKEN_SECRET or JWT_SECRET)
      try {
        const secret = process.env.COMM_DEVICE_TOKEN_SECRET || process.env.JWT_SECRET;
        if (secret && secret.length >= 32) {
          const deviceClaims = verify(token, secret, {
            algorithms: ['HS256'], issuer: 'sentinel-communications', audience: 'communication-device',
          }) as { typ?: string; deviceId?: string; deviceUuid?: string };
          if (deviceClaims.typ === 'device-access' && deviceClaims.deviceId) {
            const pool = (this.store as any).db || (this.store as any).pool;
            if (!pool?.query) return next(new Error('authentication_unavailable'));
            const result = await pool.query(
              `SELECT id, tenant_id, branch_id FROM communication_devices
               WHERE id = $1 AND device_uuid = $2 AND status = 'ACTIVE' AND revoked_at IS NULL LIMIT 1`,
              [deviceClaims.deviceId, deviceClaims.deviceUuid]
            );
            const device = result.rows[0];
            if (!device) return next(new Error('unauthorized'));
            socket.data.deviceId = device.id;
            socket.data.tenantId = device.tenant_id;
            socket.data.branchId = device.branch_id;
            const employeeLinks = await pool.query(
              `SELECT employee_id FROM communication_device_employees
               WHERE device_id = $1 AND tenant_id = $2 AND unlinked_at IS NULL AND can_receive_calls = true`,
              [device.id, device.tenant_id]
            );
            socket.data.employeeIds = employeeLinks.rows.map((row: { employee_id: string }) => row.employee_id);
            socket.data.identityType = 'device';
            return next();
          }
        }
      } catch {
        // Continue by validating a user session token below.
      }

      // 2. Try Operator Session Token (Opaque 64-char token stored in user_sessions)
      try {
        if (typeof (this.store as any).findSessionByAccessToken === 'function') {
          const tokenHash = createHash('sha256').update(token).digest('base64');
          const session = await (this.store as any).findSessionByAccessToken(tokenHash);
          if (session) {
            const expiresAt = new Date(session.accessExpiresAt ?? session.expiresAt).getTime();
            if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
              const user = (typeof (this.store as any).getUserById === 'function' ? await (this.store as any).getUserById(session.userId) : null) || await this.store.getUser(session.userId);
              if (user && (user.status === 'active' || user.active === true) && user.tenantId === session.tenantId) {
                socket.data.userId = user.id;
                socket.data.tenantId = user.tenantId;
                socket.data.identityType = 'operator';
                return next();
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn({ err }, 'Error validating operator session token for WebSocket');
      }

      // 3. Try User JWT (if authenticated with a JWT token signed with JWT_SECRET)
      try {
        const secret = process.env.JWT_SECRET;
        if (secret && secret.length >= 32) {
          const claims = verify(token, secret, { algorithms: ['HS256'] }) as { sub?: string; tid?: string };
          if (claims.sub && claims.tid) {
            const user = (typeof (this.store as any).getUserById === 'function' ? await (this.store as any).getUserById(claims.sub) : null) || await this.store.getUser(claims.sub);
            if (user && (user.status === 'active' || user.active === true) && user.tenantId === claims.tid) {
              socket.data.userId = user.id;
              socket.data.tenantId = user.tenantId;
              socket.data.identityType = 'operator';
              return next();
            }
          }
        }
      } catch {
        // Fall through to unauthorized
      }

      return next(new Error('unauthorized'));
    });

    const communicationsPool = (this.store as any).db || (this.store as any).pool;
    if (communicationsPool?.query) {
      (this.io as any).communicationSignalingGateway = new CommunicationSignalingGateway(this.io, communicationsPool);
    } else {
      this.logger.error('Communication signaling is unavailable: PostgreSQL pool missing');
    }

    this.setupEventHandlers();
    this.logger.info('WebSocket service initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected:', socket.id);

      const tenantId = socket.data.tenantId as string | undefined;
      if (tenantId) {
        if (!this.connectedClients.has(tenantId)) this.connectedClients.set(tenantId, new Set());
        this.connectedClients.get(tenantId)!.add(socket.id);
        socket.join(`tenant:${tenantId}`);
      }
      socket.on('authenticate', () => socket.emit('authenticated', {
        success: Boolean(socket.data.tenantId), tenantId: socket.data.tenantId,
      }));

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
   * Broadcast video wall layout and matrix dispatch across SOC screens & operators
   */
  broadcastVideoWallDispatch(tenantId: string, dispatch: VideoWallDispatchEvent) {
    this.io.to(`tenant:${tenantId}`).emit('video-wall:dispatch', dispatch);
    this.io.to(`wall:${dispatch.displayCode}`).emit('video-wall:dispatch', dispatch);
    this.io.emit('video-wall:dispatch', dispatch);
    this.logger.info('Video Wall Dispatch broadcasted via WebSocket:', {
      tenantId,
      displayCode: dispatch.displayCode,
      camerasCount: dispatch.assignedCameras.length,
      dispatchedBy: dispatch.dispatchedBy,
    });
  }

  /**
   * Broadcast real-time collaborative camera annotation / pin note across all shifts & operators
   */
  broadcastCameraAnnotation(tenantId: string, annotation: CameraAnnotationEvent) {
    this.io.to(`tenant:${tenantId}`).emit('camera:annotation:updated', annotation);
    this.io.to(`camera:${annotation.cameraId}`).emit('camera:annotation:updated', annotation);
    this.io.emit('camera:annotation:updated', annotation);
    this.logger.info('Camera Annotation broadcasted via WebSocket:', {
      tenantId,
      cameraId: annotation.cameraId,
      flagType: annotation.flagType,
      authorName: annotation.authorName,
      action: annotation.action,
    });
  }

  /**
   * Broadcast real-time direct camera intervention (siren, strobe, floodlight, door unlock)
   */
  broadcastCameraIntervention(tenantId: string, event: CameraInterventionEvent) {
    this.io.to(`tenant:${tenantId}`).emit('camera:intervention:updated', event);
    this.io.to(`camera:${event.cameraId}`).emit('camera:intervention:updated', event);
    this.io.emit('camera:intervention:updated', event);
    this.logger?.info?.('Camera Intervention broadcasted via WebSocket:', {
      tenantId,
      cameraId: event.cameraId,
      type: event.type,
      state: event.state,
      triggeredBy: event.triggeredBy,
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
   * Get the underlying Socket.IO server instance
   * Used by subsystems that need direct access to Socket.IO (e.g., communications)
   */
  getSocketIOServer(): SocketIOServer {
    return this.io;
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
