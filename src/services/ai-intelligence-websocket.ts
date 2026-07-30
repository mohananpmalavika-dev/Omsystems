/**
 * AI Intelligence Layer WebSocket Service
 * Real-time updates for incident correlation, SOP execution, and investigation progress
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';

export interface IncidentClusterUpdate {
  type: 'cluster-created' | 'cluster-updated' | 'cluster-merged' | 'cluster-closed';
  clusterId: string;
  tenantId: string;
  branchId?: string;
  incidentType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  alertCount: number;
  confidence: number;
  summary: string;
  timestamp: Date;
}

export interface SOPExecutionUpdate {
  type: 'sop-started' | 'step-completed' | 'sop-escalated' | 'sop-completed';
  executionId: string;
  sopId: string;
  incidentId: string;
  tenantId: string;
  currentStep?: number;
  totalSteps?: number;
  stepResult?: any;
  escalationReason?: string;
  timestamp: Date;
}

export interface InvestigationUpdate {
  type: 'report-generating' | 'report-ready' | 'evidence-collected' | 'timeline-updated';
  reportId: string;
  incidentId: string;
  tenantId: string;
  progress?: number;
  status: string;
  timestamp: Date;
}

export interface EvidenceUpdate {
  type: 'package-created' | 'evidence-added' | 'chain-updated' | 'package-signed';
  packageId: string;
  incidentId: string;
  tenantId: string;
  evidenceCount?: number;
  chainLength?: number;
  timestamp: Date;
}

export interface VideoSearchUpdate {
  type: 'search-started' | 'search-completed' | 'results-found';
  searchId: string;
  tenantId: string;
  query?: string;
  resultCount?: number;
  timestamp: Date;
}

/**
 * Event emitter for AI Intelligence updates
 */
export class AIIntelligenceEventEmitter extends EventEmitter {
  emitClusterUpdate(update: IncidentClusterUpdate) {
    this.emit('cluster:update', update);
  }

  emitSOPUpdate(update: SOPExecutionUpdate) {
    this.emit('sop:update', update);
  }

  emitInvestigationUpdate(update: InvestigationUpdate) {
    this.emit('investigation:update', update);
  }

  emitEvidenceUpdate(update: EvidenceUpdate) {
    this.emit('evidence:update', update);
  }

  emitVideoSearchUpdate(update: VideoSearchUpdate) {
    this.emit('video-search:update', update);
  }
}

// Singleton event emitter
export const aiIntelligenceEvents = new AIIntelligenceEventEmitter();

/**
 * WebSocket handler for AI Intelligence Layer
 */
export class AIIntelligenceWebSocket {
  private io: SocketIOServer;
  private namespace: any;
  private logger: any;
  private connectedClients: Map<string, Set<string>> = new Map(); // tenantId -> socketIds

  constructor(io: SocketIOServer, logger?: any) {
    this.io = io;
    this.logger = logger || console;
    this.namespace = this.io.of('/ai-intelligence');
    
    this.initializeEventListeners();
    this.setupNamespaceHandlers();
    
    this.logger.info('AI Intelligence WebSocket initialized');
  }

  /**
   * Setup namespace-specific handlers
   */
  private setupNamespaceHandlers() {
    this.namespace.on('connection', (socket: Socket) => {
      this.logger.info(`AI Intelligence client connected: ${socket.id}`);

      // Authentication
      socket.on('authenticate', (data: { tenantId: string; userId: string }) => {
        const { tenantId, userId } = data;

        // Store connection
        if (!this.connectedClients.has(tenantId)) {
          this.connectedClients.set(tenantId, new Set());
        }
        this.connectedClients.get(tenantId)!.add(socket.id);

        // Join rooms
        socket.join(`tenant:${tenantId}`);
        socket.data.tenantId = tenantId;
        socket.data.userId = userId;

        this.logger.info(`AI Intelligence client authenticated: ${socket.id} (tenant: ${tenantId})`);
        socket.emit('authenticated', { success: true });
      });

      // Subscribe to incident clusters
      socket.on('subscribe:clusters', () => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:clusters`);
        socket.emit('subscribed', { channel: 'clusters' });
        this.logger.debug(`Client ${socket.id} subscribed to clusters`);
      });

      // Subscribe to specific incident
      socket.on('subscribe:incident', (incidentId: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:incident:${incidentId}`);
        socket.emit('subscribed', { channel: `incident:${incidentId}` });
        this.logger.debug(`Client ${socket.id} subscribed to incident ${incidentId}`);
      });

      // Subscribe to SOP executions
      socket.on('subscribe:sop', (executionId: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:sop:${executionId}`);
        socket.emit('subscribed', { channel: `sop:${executionId}` });
        this.logger.debug(`Client ${socket.id} subscribed to SOP execution ${executionId}`);
      });

      // Subscribe to investigation reports
      socket.on('subscribe:investigation', (reportId: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:investigation:${reportId}`);
        socket.emit('subscribed', { channel: `investigation:${reportId}` });
        this.logger.debug(`Client ${socket.id} subscribed to investigation ${reportId}`);
      });

      // Subscribe to evidence packages
      socket.on('subscribe:evidence', (packageId: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:evidence:${packageId}`);
        socket.emit('subscribed', { channel: `evidence:${packageId}` });
        this.logger.debug(`Client ${socket.id} subscribed to evidence package ${packageId}`);
      });

      // Subscribe to branch-specific updates
      socket.on('subscribe:branch', (branchId: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(`${tenantId}:branch:${branchId}`);
        socket.emit('subscribed', { channel: `branch:${branchId}` });
        this.logger.debug(`Client ${socket.id} subscribed to branch ${branchId}`);
      });

      // Unsubscribe
      socket.on('unsubscribe', (channel: string) => {
        const tenantId = socket.data.tenantId;
        if (!tenantId) return;

        socket.leave(`${tenantId}:${channel}`);
        socket.emit('unsubscribed', { channel });
        this.logger.debug(`Client ${socket.id} unsubscribed from ${channel}`);
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

        this.logger.info(`AI Intelligence client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Initialize event listeners from the AI services
   */
  private initializeEventListeners() {
    // Incident cluster updates
    aiIntelligenceEvents.on('cluster:update', (update: IncidentClusterUpdate) => {
      this.broadcastClusterUpdate(update);
    });

    // SOP execution updates
    aiIntelligenceEvents.on('sop:update', (update: SOPExecutionUpdate) => {
      this.broadcastSOPUpdate(update);
    });

    // Investigation updates
    aiIntelligenceEvents.on('investigation:update', (update: InvestigationUpdate) => {
      this.broadcastInvestigationUpdate(update);
    });

    // Evidence updates
    aiIntelligenceEvents.on('evidence:update', (update: EvidenceUpdate) => {
      this.broadcastEvidenceUpdate(update);
    });

    // Video search updates
    aiIntelligenceEvents.on('video-search:update', (update: VideoSearchUpdate) => {
      this.broadcastVideoSearchUpdate(update);
    });
  }

  /**
   * Broadcast cluster update to relevant subscribers
   */
  private broadcastClusterUpdate(update: IncidentClusterUpdate) {
    const { tenantId, branchId, clusterId } = update;

    // Broadcast to tenant
    this.namespace.to(`tenant:${tenantId}`).emit('cluster:update', update);

    // Broadcast to clusters subscribers
    this.namespace.to(`${tenantId}:clusters`).emit('cluster:update', update);

    // Broadcast to branch subscribers if specified
    if (branchId) {
      this.namespace.to(`${tenantId}:branch:${branchId}`).emit('cluster:update', update);
    }

    this.logger.debug(`Cluster update broadcasted: ${clusterId} (${update.type})`);
  }

  /**
   * Broadcast SOP execution update
   */
  private broadcastSOPUpdate(update: SOPExecutionUpdate) {
    const { tenantId, executionId, incidentId } = update;

    // Broadcast to specific SOP execution subscribers
    this.namespace.to(`${tenantId}:sop:${executionId}`).emit('sop:update', update);

    // Broadcast to incident subscribers
    this.namespace.to(`${tenantId}:incident:${incidentId}`).emit('sop:update', update);

    this.logger.debug(`SOP update broadcasted: ${executionId} (${update.type})`);
  }

  /**
   * Broadcast investigation update
   */
  private broadcastInvestigationUpdate(update: InvestigationUpdate) {
    const { tenantId, reportId, incidentId } = update;

    // Broadcast to investigation subscribers
    this.namespace.to(`${tenantId}:investigation:${reportId}`).emit('investigation:update', update);

    // Broadcast to incident subscribers
    this.namespace.to(`${tenantId}:incident:${incidentId}`).emit('investigation:update', update);

    this.logger.debug(`Investigation update broadcasted: ${reportId} (${update.type})`);
  }

  /**
   * Broadcast evidence update
   */
  private broadcastEvidenceUpdate(update: EvidenceUpdate) {
    const { tenantId, packageId, incidentId } = update;

    // Broadcast to evidence package subscribers
    this.namespace.to(`${tenantId}:evidence:${packageId}`).emit('evidence:update', update);

    // Broadcast to incident subscribers
    this.namespace.to(`${tenantId}:incident:${incidentId}`).emit('evidence:update', update);

    this.logger.debug(`Evidence update broadcasted: ${packageId} (${update.type})`);
  }

  /**
   * Broadcast video search update
   */
  private broadcastVideoSearchUpdate(update: VideoSearchUpdate) {
    const { tenantId, searchId } = update;

    // Broadcast to tenant
    this.namespace.to(`tenant:${tenantId}`).emit('video-search:update', update);

    this.logger.debug(`Video search update broadcasted: ${searchId} (${update.type})`);
  }

  /**
   * Get connected client count for tenant
   */
  getConnectedClientCount(tenantId: string): number {
    const clients = this.connectedClients.get(tenantId);
    return clients ? clients.size : 0;
  }

  /**
   * Disconnect all clients for tenant
   */
  disconnectTenant(tenantId: string) {
    const clients = this.connectedClients.get(tenantId);
    if (!clients) return;

    for (const socketId of clients) {
      const socket = this.namespace.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }

    this.connectedClients.delete(tenantId);
    this.logger.info(`All AI Intelligence clients disconnected for tenant: ${tenantId}`);
  }
}

/**
 * Initialize AI Intelligence WebSocket
 */
export function initializeAIIntelligenceWebSocket(
  io: SocketIOServer,
  logger?: any
): AIIntelligenceWebSocket {
  return new AIIntelligenceWebSocket(io, logger);
}
