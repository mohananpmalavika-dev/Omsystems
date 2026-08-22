/**
 * Mobile Real-Time Event Service
 * 
 * Provides SSE and WebSocket real-time updates for mobile operations:
 * - P1/P2 alert notifications
 * - Incident status changes
 * - Fleet health updates
 * - SLA countdown updates
 * - Connection state tracking
 */

import { EventEmitter } from "node:events";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { AlertOperationsService, type AlertRealtimeEvent } from "../../alerts/services/alert-operations.service.js";
import type { ControlPlaneStore } from "../../control-plane-store.js";

export interface MobileRealtimeEvent {
  type: 
    | "ALERT_CREATED"
    | "ALERT_ACKNOWLEDGED"
    | "ALERT_ESCALATED"
    | "ALERT_RESOLVED"
    | "INCIDENT_UPDATED"
    | "BRANCH_HEALTH_CHANGED"
    | "SLA_WARNING"
    | "SLA_BREACHED"
    | "OPERATOR_ASSIGNED"
    | "HEARTBEAT";
  payload: any;
  timestamp: string;
  tenantId: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
}

export interface MobileConnectionState {
  connected: boolean;
  lastHeartbeat: Date;
  clientId: string;
  operatorId: string;
  tenantId: string;
}

/**
 * Mobile Real-Time Service
 * Manages SSE streams and WebSocket connections for mobile clients
 */
export class MobileRealtimeService extends EventEmitter {
  private sseClients = new Map<string, { res: any; operatorId: string; tenantId: string }>();
  private connectionStates = new Map<string, MobileConnectionState>();
  private heartbeatInterval?: NodeJS.Timeout;
  private slaCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly alertService: AlertOperationsService,
    private readonly store: ControlPlaneStore,
  ) {
    super();
    this.initializeAlertSubscription();
    this.startHeartbeat();
    this.startSLAMonitoring();
  }

  /**
   * Subscribe to alert service events
   */
  private initializeAlertSubscription() {
    this.alertService.subscribe((event: AlertRealtimeEvent) => {
      const mobileEvent: MobileRealtimeEvent = {
        type: this.mapAlertEventType(event.type),
        payload: {
          alertId: event.alertId,
          severity: event.payload.severity,
          status: event.payload.status,
          branch: event.payload.branch,
          camera: event.payload.camera,
          detection: event.payload.detection,
          acknowledgement: event.payload.acknowledgement,
          assignment: event.payload.assignment,
          resolution: event.payload.resolution,
        },
        timestamp: event.timestamp,
        tenantId: event.tenantId,
        priority: this.determinePriority(event),
      };

      this.broadcastToTenant(event.tenantId, mobileEvent);
    });
  }

  private mapAlertEventType(type: string): MobileRealtimeEvent["type"] {
    switch (type) {
      case "ALERT_CREATED": return "ALERT_CREATED";
      case "ALERT_ACKNOWLEDGED": return "ALERT_ACKNOWLEDGED";
      case "ALERT_ESCALATED": return "ALERT_ESCALATED";
      case "ALERT_RESOLVED": return "ALERT_RESOLVED";
      default: return "INCIDENT_UPDATED";
    }
  }

  private determinePriority(event: AlertRealtimeEvent): "HIGH" | "MEDIUM" | "LOW" {
    if (event.payload.severity === "P1") return "HIGH";
    if (event.payload.severity === "P2") return "MEDIUM";
    return "LOW";
  }

  /**
   * Start heartbeat for connection monitoring
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      
      // Send heartbeat to all SSE clients
      for (const [clientId, client] of this.sseClients.entries()) {
        try {
          this.sendSSE(client.res, {
            type: "HEARTBEAT",
            payload: { timestamp: now.toISOString() },
            timestamp: now.toISOString(),
            tenantId: client.tenantId,
          });

          // Update connection state
          const state = this.connectionStates.get(clientId);
          if (state) {
            state.lastHeartbeat = now;
          }
        } catch (error) {
          // Client disconnected, clean up
          this.removeSSEClient(clientId);
        }
      }

      // Clean up stale connections (no heartbeat in 60 seconds)
      const staleThreshold = new Date(now.getTime() - 60000);
      for (const [clientId, state] of this.connectionStates.entries()) {
        if (state.lastHeartbeat < staleThreshold) {
          this.removeSSEClient(clientId);
        }
      }
    }, 15000); // 15 second heartbeat
  }

  /**
   * Start SLA monitoring for active incidents
   */
  private startSLAMonitoring() {
    this.slaCheckInterval = setInterval(async () => {
      // Get all active P1 alerts from alert service
      const alerts = Array.from((this.alertService as any).alerts.values());
      const now = Date.now();

      for (const alert of alerts) {
        if (alert.status === "NEW" || alert.status === "ACKNOWLEDGED") {
          const responseRemaining = alert.responseDeadline.getTime() - now;
          const resolutionRemaining = alert.resolutionDeadline.getTime() - now;

          // Warning at 25% remaining
          if (responseRemaining > 0 && responseRemaining < (2 * 60 * 1000 * 0.25) && responseRemaining > (2 * 60 * 1000 * 0.24)) {
            this.broadcastToTenant(alert.tenantId, {
              type: "SLA_WARNING",
              payload: {
                alertId: alert.id,
                severity: alert.severity,
                slaType: "RESPONSE",
                remainingSeconds: Math.floor(responseRemaining / 1000),
              },
              timestamp: new Date().toISOString(),
              tenantId: alert.tenantId,
              priority: "HIGH",
            });
          }

          // Breach notification
          if (responseRemaining < 0 && responseRemaining > -5000) {
            this.broadcastToTenant(alert.tenantId, {
              type: "SLA_BREACHED",
              payload: {
                alertId: alert.id,
                severity: alert.severity,
                slaType: "RESPONSE",
                breachedBy: Math.abs(Math.floor(responseRemaining / 1000)),
              },
              timestamp: new Date().toISOString(),
              tenantId: alert.tenantId,
              priority: "HIGH",
            });
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Register SSE client
   */
  registerSSEClient(
    clientId: string,
    res: any,
    operatorId: string,
    tenantId: string,
  ) {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Store client
    this.sseClients.set(clientId, { res, operatorId, tenantId });

    // Track connection state
    this.connectionStates.set(clientId, {
      connected: true,
      lastHeartbeat: new Date(),
      clientId,
      operatorId,
      tenantId,
    });

    // Send initial connection event
    this.sendSSE(res, {
      type: "HEARTBEAT",
      payload: { 
        message: "Connected to Sentinel Grid Mobile Operations real-time stream",
        clientId,
      },
      timestamp: new Date().toISOString(),
      tenantId,
    });

    // Handle client disconnect
    res.on("close", () => {
      this.removeSSEClient(clientId);
    });

    console.log(`[MobileRealtime] SSE client registered: ${clientId} (operator: ${operatorId}, tenant: ${tenantId})`);
  }

  /**
   * Remove SSE client
   */
  private removeSSEClient(clientId: string) {
    this.sseClients.delete(clientId);
    this.connectionStates.delete(clientId);
    console.log(`[MobileRealtime] SSE client removed: ${clientId}`);
  }

  /**
   * Send SSE event to client
   */
  private sendSSE(res: any, event: MobileRealtimeEvent) {
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error("[MobileRealtime] Error sending SSE event:", error);
      throw error;
    }
  }

  /**
   * Broadcast event to all clients in tenant
   */
  private broadcastToTenant(tenantId: string, event: MobileRealtimeEvent) {
    for (const [clientId, client] of this.sseClients.entries()) {
      if (client.tenantId === tenantId) {
        try {
          this.sendSSE(client.res, event);
        } catch (error) {
          this.removeSSEClient(clientId);
        }
      }
    }
  }

  /**
   * Broadcast event to specific operator
   */
  broadcastToOperator(
    tenantId: string,
    operatorId: string,
    event: MobileRealtimeEvent,
  ) {
    for (const [clientId, client] of this.sseClients.entries()) {
      if (client.tenantId === tenantId && client.operatorId === operatorId) {
        try {
          this.sendSSE(client.res, event);
        } catch (error) {
          this.removeSSEClient(clientId);
        }
      }
    }
  }

  /**
   * Notify incident assignment
   */
  notifyIncidentAssignment(
    tenantId: string,
    operatorId: string,
    incidentId: string,
    incidentTitle: string,
    severity: string,
  ) {
    this.broadcastToOperator(tenantId, operatorId, {
      type: "OPERATOR_ASSIGNED",
      payload: {
        incidentId,
        title: incidentTitle,
        severity,
        message: `You have been assigned to ${severity} incident: ${incidentTitle}`,
      },
      timestamp: new Date().toISOString(),
      tenantId,
      priority: severity === "P1" ? "HIGH" : "MEDIUM",
    });
  }

  /**
   * Notify branch health change
   */
  notifyBranchHealthChange(
    tenantId: string,
    branchId: string,
    branchName: string,
    oldState: string,
    newState: string,
  ) {
    this.broadcastToTenant(tenantId, {
      type: "BRANCH_HEALTH_CHANGED",
      payload: {
        branchId,
        branchName,
        oldState,
        newState,
      },
      timestamp: new Date().toISOString(),
      tenantId,
      priority: newState === "CRITICAL" ? "HIGH" : "MEDIUM",
    });
  }

  /**
   * Get connection state for client
   */
  getConnectionState(clientId: string): MobileConnectionState | undefined {
    return this.connectionStates.get(clientId);
  }

  /**
   * Get all connected clients for tenant
   */
  getConnectedClients(tenantId: string): Array<{ clientId: string; operatorId: string }> {
    const clients: Array<{ clientId: string; operatorId: string }> = [];
    
    for (const [clientId, client] of this.sseClients.entries()) {
      if (client.tenantId === tenantId) {
        clients.push({
          clientId,
          operatorId: client.operatorId,
        });
      }
    }

    return clients;
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.slaCheckInterval) {
      clearInterval(this.slaCheckInterval);
    }

    // Close all SSE connections
    for (const [clientId, client] of this.sseClients.entries()) {
      try {
        client.res.end();
      } catch (error) {
        // Ignore errors on cleanup
      }
    }

    this.sseClients.clear();
    this.connectionStates.clear();

    console.log("[MobileRealtime] Service destroyed");
  }
}

/**
 * Initialize WebSocket namespace for mobile operations
 */
export function initializeMobileWebSocket(
  io: SocketIOServer,
  alertService: AlertOperationsService,
  store: ControlPlaneStore,
) {
  const mobileNamespace = io.of("/mobile-operations");

  mobileNamespace.on("connection", (socket: Socket) => {
    const { operatorId, tenantId } = socket.handshake.auth;

    if (!operatorId || !tenantId) {
      socket.disconnect(true);
      return;
    }

    console.log(`[MobileWebSocket] Client connected: ${socket.id} (operator: ${operatorId}, tenant: ${tenantId})`);

    // Join tenant room
    socket.join(`tenant:${tenantId}`);

    // Join operator room
    socket.join(`operator:${tenantId}:${operatorId}`);

    // Subscribe to alert events
    const unsubscribe = alertService.subscribe((event: AlertRealtimeEvent) => {
      if (event.tenantId === tenantId) {
        socket.emit("alert:event", {
          type: event.type,
          alertId: event.alertId,
          payload: event.payload,
          timestamp: event.timestamp,
        });
      }
    });

    // Handle subscription requests
    socket.on("subscribe:branch", (branchId: string) => {
      socket.join(`branch:${tenantId}:${branchId}`);
      console.log(`[MobileWebSocket] ${socket.id} subscribed to branch ${branchId}`);
    });

    socket.on("unsubscribe:branch", (branchId: string) => {
      socket.leave(`branch:${tenantId}:${branchId}`);
      console.log(`[MobileWebSocket] ${socket.id} unsubscribed from branch ${branchId}`);
    });

    // Handle ping/pong for connection monitoring
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date().toISOString() });
    });

    // Request current state
    socket.on("request:incidents", async () => {
      try {
        const incidents = await store.listIncidents(tenantId, {
          limit: 20,
          severity: "P1",
        });
        socket.emit("incidents:state", { incidents });
      } catch (error) {
        console.error("[MobileWebSocket] Error fetching incidents:", error);
        socket.emit("error", { message: "Failed to fetch incidents" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      unsubscribe();
      console.log(`[MobileWebSocket] Client disconnected: ${socket.id}`);
    });
  });

  return mobileNamespace;
}
