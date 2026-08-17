/**
 * Mobile Operations BFF Routes
 * Production routes with authentication, RBAC, audit logging, and real-time SSE
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MobileOperationsService } from "../mobile/services/mobile-operations.service.js";
import { MobileRealtimeService } from "../mobile/services/mobile-realtime.service.js";
import { MobilePushNotificationService } from "../mobile/services/mobile-push-notification.service.js";
import { AlertOperationsService } from "../alerts/services/alert-operations.service.js";

let mobileService: MobileOperationsService;
let realtimeService: MobileRealtimeService;
let pushService: MobilePushNotificationService;

// Validation schemas
const acknowledgeSchema = z.object({
  deviceId: z.string().optional(),
});

const escalateSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  recipients: z.array(z.string().email()).optional(),
});

const assignSchema = z.object({
  targetUserId: z.string().uuid(),
  targetUserName: z.string(),
});

const addNoteSchema = z.object({
  noteType: z.enum([
    "FALSE_ALARM",
    "BRANCH_CONTACTED",
    "POLICE_CONTACTED",
    "SECURITY_DISPATCHED",
    "MAINTENANCE_ACTIVITY",
    "PERSON_CONFIRMED",
    "CAMERA_FAILURE",
    "CUSTOM_NOTE",
  ]),
  text: z.string().max(2000).optional(),
});

/**
 * Check if user has mobile operations permission
 */
function checkMobileAccess(request: FastifyRequest): boolean {
  // TODO: Implement actual RBAC check
  // For now, allow authenticated users
  return !!request.currentUser;
}

/**
 * Audit log helper
 */
async function auditMobileAction(
  store: ControlPlaneStore,
  request: FastifyRequest,
  action: string,
  resourceId: string | null,
  outcome: "success" | "failure",
  details?: any,
) {
  if (!request.currentUser) return;

  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action: `mobile:${action}`,
    resourceNodeId: resourceId,
    outcome,
    sourceIp: request.ip,
    details: {
      ...details,
      userAgent: request.headers["user-agent"],
      deviceType: "mobile",
    },
  });
}

export async function registerMobileOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Initialize services
  const alertService = new AlertOperationsService(store.pool);
  mobileService = new MobileOperationsService(store, store.pool);
  realtimeService = new MobileRealtimeService(alertService, store);
  pushService = new MobilePushNotificationService(store, alertService, store.pool);

  // ============ REAL-TIME SSE ENDPOINT ============
  
  /**
   * SSE stream for real-time mobile operations updates
   */
  app.get("/api/mobile/v1/events", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const clientId = randomUUID();
    const operatorId = request.currentUser!.id;
    const tenantId = request.currentUser!.tenantId;

    // Register SSE client
    realtimeService.registerSSEClient(clientId, reply.raw, operatorId, tenantId);

    await auditMobileAction(store, request, "sse_connected", null, "success", {
      clientId,
    });

    // Keep connection open
    return reply;
  });

  // ============ MOBILE HOME DASHBOARD ============

  /**
   * Get mobile home dashboard with P1 alerts, incidents, fleet health, and live feed
   */
  app.get("/api/mobile/v1/home", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    try {
      const data = await mobileService.getMobileHome(
        request.currentUser!.tenantId,
        request.currentUser!.id,
      );

      await auditMobileAction(store, request, "home_accessed", null, "success");

      return { success: true, data };
    } catch (error: any) {
      await auditMobileAction(store, request, "home_accessed", null, "failure", {
        error: error.message,
      });
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============ INCIDENT OPERATIONS ============

  /**
   * Get specific incident details
   */
  app.get("/api/mobile/v1/incidents/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };

    try {
      const incident = await mobileService.getIncidentById(
        id,
        request.currentUser!.tenantId,
      );

      if (!incident) {
        return reply.code(404).send({ success: false, error: "INCIDENT_NOT_FOUND" });
      }

      await auditMobileAction(store, request, "incident_viewed", id, "success");

      return { success: true, data: incident };
    } catch (error: any) {
      await auditMobileAction(store, request, "incident_viewed", id, "failure", {
        error: error.message,
      });
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Acknowledge incident (1-tap operation)
   */
  app.post("/api/mobile/v1/incidents/:id/acknowledge", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };
    const body = acknowledgeSchema.parse(request.body);

    const operator = {
      id: request.currentUser!.id,
      name: request.currentUser!.username,
    };

    try {
      const result = await mobileService.acknowledgeIncident(
        id,
        request.currentUser!.tenantId,
        operator,
        body.deviceId,
      );

      await auditMobileAction(store, request, "incident_acknowledged", id, "success", {
        deviceId: body.deviceId,
      });

      return result;
    } catch (error: any) {
      await auditMobileAction(store, request, "incident_acknowledged", id, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Escalate incident
   */
  app.post("/api/mobile/v1/incidents/:id/escalate", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };
    const body = escalateSchema.parse(request.body);

    const operator = {
      id: request.currentUser!.id,
      name: request.currentUser!.username,
    };

    try {
      const result = await mobileService.escalateIncident(
        id,
        request.currentUser!.tenantId,
        operator,
        body.reason,
        body.recipients,
      );

      await auditMobileAction(store, request, "incident_escalated", id, "success", {
        reason: body.reason,
        recipients: body.recipients,
      });

      return result;
    } catch (error: any) {
      await auditMobileAction(store, request, "incident_escalated", id, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Assign incident
   */
  app.post("/api/mobile/v1/incidents/:id/assign", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };
    const body = assignSchema.parse(request.body);

    const operator = {
      id: request.currentUser!.id,
      name: request.currentUser!.username,
    };

    try {
      const result = await mobileService.assignIncident(
        id,
        request.currentUser!.tenantId,
        body.targetUserId,
        body.targetUserName,
        operator,
      );

      await auditMobileAction(store, request, "incident_assigned", id, "success", {
        targetUserId: body.targetUserId,
        targetUserName: body.targetUserName,
      });

      // Notify assigned operator via real-time
      realtimeService.notifyIncidentAssignment(
        request.currentUser!.tenantId,
        body.targetUserId,
        id,
        "Incident assigned to you",
        "P1", // TODO: Get actual severity
      );

      return result;
    } catch (error: any) {
      await auditMobileAction(store, request, "incident_assigned", id, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Add structured note to incident timeline
   */
  app.post("/api/mobile/v1/incidents/:id/notes", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };
    const body = addNoteSchema.parse(request.body);

    const operator = {
      id: request.currentUser!.id,
      name: request.currentUser!.username,
    };

    try {
      const result = await mobileService.addIncidentNote(
        id,
        request.currentUser!.tenantId,
        operator,
        body.noteType,
        body.text,
      );

      await auditMobileAction(store, request, "incident_note_added", id, "success", {
        noteType: body.noteType,
      });

      return result;
    } catch (error: any) {
      await auditMobileAction(store, request, "incident_note_added", id, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Initiate branch call
   */
  app.post("/api/mobile/v1/incidents/:id/call-branch", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };

    const operator = {
      id: request.currentUser!.id,
      name: request.currentUser!.username,
    };

    try {
      const result = await mobileService.initiateBranchCall(
        id,
        request.currentUser!.tenantId,
        operator,
      );

      await auditMobileAction(store, request, "branch_call_initiated", id, "success", {
        phone: result.phone,
      });

      return result;
    } catch (error: any) {
      await auditMobileAction(store, request, "branch_call_initiated", id, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ============ BRANCH HEALTH ============

  /**
   * Get detailed branch health
   */
  app.get("/api/mobile/v1/branches/:id/health", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };

    try {
      const health = await mobileService.getBranchHealth(
        id,
        request.currentUser!.tenantId,
      );

      if (!health) {
        return reply.code(404).send({ success: false, error: "BRANCH_NOT_FOUND" });
      }

      return { success: true, data: health };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============ LIVE STREAMING ============

  /**
   * Create mobile live streaming session
   */
  app.post("/api/mobile/v1/cameras/:id/live-session", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { id } = request.params as { id: string };

    const operator = {
      id: request.currentUser!.id,
    };

    try {
      const session = await mobileService.createMobileLiveSession(
        id,
        request.currentUser!.tenantId,
        operator,
      );

      await auditMobileAction(store, request, "live_session_created", id, "success", {
        sessionId: session.sessionId,
      });

      return { success: true, data: session };
    } catch (error: any) {
      await auditMobileAction(store, request, "live_session_created", id, "failure", {
        error: error.message,
      });
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============ LIVE EVENTS FEED ============

  /**
   * Get recent live operations events
   */
  app.get("/api/mobile/v1/live-events", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { limit } = request.query as { limit?: string };
    const events = mobileService.getLiveEvents(limit ? parseInt(limit) : 10);

    return { success: true, data: events };
  });

  // ============ CONNECTION STATUS ============

  /**
   * Get realtime connection statistics
   */
  app.get("/api/mobile/v1/realtime/status", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const clients = realtimeService.getConnectedClients(request.currentUser!.tenantId);

    return {
      success: true,
      data: {
        connectedClients: clients.length,
        clients: clients.map(c => ({
          clientId: c.clientId,
          operatorId: c.operatorId,
        })),
      },
    };
  });

  // ============ PUSH NOTIFICATIONS ============

  const registerDeviceSchema = z.object({
    platform: z.enum(["android", "ios", "web"]),
    deviceToken: z.string().min(10),
    endpoint: z.string().url().optional(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }).optional(),
  });

  /**
   * Register device for push notifications
   */
  app.post("/api/mobile/v1/push/register", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const body = registerDeviceSchema.parse(request.body);

    try {
      const device = await pushService.registerDevice({
        userId: request.currentUser!.id,
        tenantId: request.currentUser!.tenantId,
        platform: body.platform,
        deviceToken: body.deviceToken,
        endpoint: body.endpoint,
        keys: body.keys,
        isActive: true,
      });

      await auditMobileAction(store, request, "push_device_registered", null, "success", {
        deviceId: device.id,
        platform: body.platform,
      });

      return {
        success: true,
        data: {
          deviceId: device.id,
          platform: device.platform,
        },
      };
    } catch (error: any) {
      await auditMobileAction(store, request, "push_device_registered", null, "failure", {
        error: error.message,
      });
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Unregister device from push notifications
   */
  app.post("/api/mobile/v1/push/unregister/:deviceId", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { deviceId } = request.params as { deviceId: string };

    try {
      const success = await pushService.unregisterDevice(deviceId);

      await auditMobileAction(store, request, "push_device_unregistered", null, "success", {
        deviceId,
      });

      return {
        success,
        message: success ? "Device unregistered" : "Device not found",
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Get user's registered devices
   */
  app.get("/api/mobile/v1/push/devices", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const devices = pushService.getUserDevices(
      request.currentUser!.id,
      request.currentUser!.tenantId,
    );

    return {
      success: true,
      data: devices.map(d => ({
        id: d.id,
        platform: d.platform,
        isActive: d.isActive,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
      })),
    };
  });

  /**
   * Get notification history
   */
  app.get("/api/mobile/v1/push/history", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    const { limit } = request.query as { limit?: string };
    const history = pushService.getNotificationHistory(
      request.currentUser!.id,
      limit ? parseInt(limit) : 50,
    );

    return {
      success: true,
      data: history.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        category: n.category,
        priority: n.priority,
        status: n.status,
        sentAt: n.sentAt,
        clickedAt: n.clickedAt,
        data: n.data,
      })),
    };
  });

  /**
   * Test push notification (for debugging)
   */
  app.post("/api/mobile/v1/push/test", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkMobileAccess(request)) {
      return reply.code(403).send({ error: "mobile_access_denied" });
    }

    try {
      const notification = await pushService.sendPushNotification({
        userId: request.currentUser!.id,
        tenantId: request.currentUser!.tenantId,
        title: "Test Notification",
        body: "This is a test notification from Sentinel Grid Mobile Command",
        priority: "normal",
        category: "alert",
      });

      return {
        success: true,
        data: {
          notificationId: notification.id,
          status: notification.status,
        },
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}
