/**
 * Security Devices WebSocket Routes
 * Real-time event streaming for security device updates
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { verify } from 'jsonwebtoken';
import { SecurityDeviceRealtimeService, WebSocketClient } from '../services/security-device-realtime.service';

interface SecurityDeviceSocket extends Socket {
  userId?: string;
  tenantId?: string;
  branchIds?: string[];
  deviceTypes?: string[];
  eventTypes?: string[];
}

export class SecurityDevicesWebSocketManager {
  private io: SocketIOServer;
  private realtimeService: SecurityDeviceRealtimeService;
  private jwtSecret: string;
  private readonly NAMESPACE = '/security-devices';

  constructor(
    httpServer: HTTPServer,
    redis: Redis,
    jwtSecret?: string
  ) {
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || '';
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET required for WebSocket authentication');
    }

    // Initialize real-time service
    this.realtimeService = SecurityDeviceRealtimeService.getInstance(redis);

    // Create Socket.IO namespace for security devices
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    }).of(this.NAMESPACE);

    this.setupConnectionHandlers();
    this.setupEventForwarding();
    this.startHeartbeat();

    console.log('[SecurityDevicesWebSocket] WebSocket manager initialized');
  }

  /**
   * Setup connection and authentication handlers
   */
  private setupConnectionHandlers(): void {
    // Authentication middleware
    this.io.use(async (socket: SecurityDeviceSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT
        const decoded = verify(token, this.jwtSecret) as any;
        
        socket.userId = decoded.userId || decoded.globalUserId;
        socket.tenantId = decoded.tenantId;
        
        next();
      } catch (error) {
        console.error('[SecurityDevicesWebSocket] Authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: SecurityDeviceSocket) => {
      console.log(`[SecurityDevicesWebSocket] Client connected: ${socket.id} (user: ${socket.userId})`);

      // Register client
      const client: WebSocketClient = {
        id: socket.id,
        userId: socket.userId!,
        tenantId: socket.tenantId!,
        connectedAt: new Date(),
      };
      
      this.realtimeService.registerClient(client);

      // Subscribe to specific branches
      socket.on('subscribe:branches', (branchIds: string[]) => {
        console.log(`[SecurityDevicesWebSocket] Client ${socket.id} subscribing to branches:`, branchIds);
        socket.branchIds = branchIds;
        this.realtimeService.updateClientFilters(socket.id, {
          branchIds,
          deviceTypes: socket.deviceTypes,
          eventTypes: socket.eventTypes,
        });
        
        branchIds.forEach(branchId => {
          socket.join(`branch:${branchId}`);
        });
      });

      // Subscribe to device types
      socket.on('subscribe:device-types', (deviceTypes: string[]) => {
        console.log(`[SecurityDevicesWebSocket] Client ${socket.id} subscribing to device types:`, deviceTypes);
        socket.deviceTypes = deviceTypes;
        this.realtimeService.updateClientFilters(socket.id, {
          branchIds: socket.branchIds,
          deviceTypes,
          eventTypes: socket.eventTypes,
        });
      });

      // Subscribe to event types
      socket.on('subscribe:event-types', (eventTypes: string[]) => {
        console.log(`[SecurityDevicesWebSocket] Client ${socket.id} subscribing to event types:`, eventTypes);
        socket.eventTypes = eventTypes;
        this.realtimeService.updateClientFilters(socket.id, {
          branchIds: socket.branchIds,
          deviceTypes: socket.deviceTypes,
          eventTypes,
        });
      });

      // Subscribe to all devices (admin mode)
      socket.on('subscribe:all', () => {
        console.log(`[SecurityDevicesWebSocket] Client ${socket.id} subscribing to all devices`);
        socket.join('all-devices');
      });

      // Unsubscribe from branches
      socket.on('unsubscribe:branches', (branchIds: string[]) => {
        branchIds.forEach(branchId => {
          socket.leave(`branch:${branchId}`);
        });
        
        // Update client filters
        socket.branchIds = socket.branchIds?.filter(id => !branchIds.includes(id));
        this.realtimeService.updateClientFilters(socket.id, {
          branchIds: socket.branchIds,
          deviceTypes: socket.deviceTypes,
          eventTypes: socket.eventTypes,
        });
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Disconnection handler
      socket.on('disconnect', (reason) => {
        console.log(`[SecurityDevicesWebSocket] Client disconnected: ${socket.id} (reason: ${reason})`);
        this.realtimeService.unregisterClient(socket.id);
      });

      // Error handler
      socket.on('error', (error) => {
        console.error(`[SecurityDevicesWebSocket] Socket error for ${socket.id}:`, error);
      });

      // Send initial connection success
      socket.emit('connected', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        message: 'Connected to Security Device Events',
      });
    });
  }

  /**
   * Setup event forwarding from real-time service to WebSocket clients
   */
  private setupEventForwarding(): void {
    this.realtimeService.on('event-for-client', ({ clientId, event }) => {
      const socket = this.io.sockets.get(clientId);
      if (socket) {
        socket.emit('security-device-event', event);
      }
    });

    // Forward panic emergencies to all clients
    this.realtimeService.on('panic-emergency-created', (emergency) => {
      this.io.emit('panic-emergency', {
        type: 'PANIC_EMERGENCY_CREATED',
        data: emergency,
        timestamp: new Date().toISOString(),
      });
    });

    // Forward panic acknowledgements
    this.realtimeService.on('panic-emergency-acknowledged', (data) => {
      this.io.emit('panic-emergency', {
        type: 'PANIC_EMERGENCY_ACKNOWLEDGED',
        data,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    setInterval(() => {
      this.realtimeService.sendHeartbeat();
      this.realtimeService.cleanupInactiveClients(5); // 5 minutes timeout
    }, 30000); // Every 30 seconds
  }

  /**
   * Broadcast event to specific branch
   */
  broadcastToBranch(branchId: string, event: any): void {
    this.io.to(`branch:${branchId}`).emit('security-device-event', event);
  }

  /**
   * Broadcast event to all clients
   */
  broadcastToAll(event: any): void {
    this.io.emit('security-device-event', event);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.io.sockets.size;
  }

  /**
   * Get clients in branch room
   */
  getBranchClientsCount(branchId: string): number {
    const room = this.io.adapter.rooms.get(`branch:${branchId}`);
    return room?.size || 0;
  }
}

/**
 * Initialize WebSocket manager
 */
export function initializeSecurityDevicesWebSocket(
  httpServer: HTTPServer,
  redis: Redis,
  jwtSecret?: string
): SecurityDevicesWebSocketManager {
  return new SecurityDevicesWebSocketManager(httpServer, redis, jwtSecret);
}
