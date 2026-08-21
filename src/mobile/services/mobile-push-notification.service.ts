/**
 * Mobile Push Notification Service
 * 
 * Handles push notifications for mobile operations:
 * - P1/P2 alert creation
 * - SLA warnings and breaches
 * - Incident assignments
 * - Escalation notifications
 * 
 * Supports:
 * - Firebase Cloud Messaging (FCM) for Android/iOS
 * - Web Push for PWA
 * - Escalation policies with retry logic
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import { AlertOperationsService, type AlertRealtimeEvent } from "../../alerts/services/alert-operations.service.js";

export interface PushNotificationDevice {
  id: string;
  userId: string;
  tenantId: string;
  platform: "android" | "ios" | "web";
  deviceToken: string;
  endpoint?: string; // For web push
  keys?: {
    p256dh: string;
    auth: string;
  };
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface PushNotificationMessage {
  id: string;
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: "high" | "normal";
  category: "alert" | "incident" | "assignment" | "escalation" | "sla_warning";
  sound?: string;
  badge?: number;
  clickAction?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  clickedAt?: Date;
  status: "pending" | "sent" | "delivered" | "failed" | "clicked";
  errorMessage?: string;
}

export interface EscalationPolicy {
  tenantId: string;
  severity: "P1" | "P2" | "P3";
  tiers: Array<{
    level: number;
    delayMinutes: number;
    recipients: string[]; // User IDs
  }>;
}

/**
 * Mobile Push Notification Service
 */
export class MobilePushNotificationService extends EventEmitter {
  private devices = new Map<string, PushNotificationDevice>();
  private notifications = new Map<string, PushNotificationMessage>();
  private escalationPolicies = new Map<string, EscalationPolicy>();
  private escalationTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: ControlPlaneStore,
    private readonly alertService: AlertOperationsService,
    private readonly pool?: Pool,
  ) {
    super();
    this.initializeDefaultPolicies();
    this.subscribeToAlertEvents();
  }

  /**
   * Initialize default escalation policies
   */
  private initializeDefaultPolicies() {
    // Default P1 escalation policy
    this.escalationPolicies.set("default:P1", {
      tenantId: "default",
      severity: "P1",
      tiers: [
        { level: 1, delayMinutes: 0, recipients: [] }, // Immediate - on-call operator
        { level: 2, delayMinutes: 5, recipients: [] }, // 5 min - supervisor
        { level: 3, delayMinutes: 10, recipients: [] }, // 10 min - manager
        { level: 4, delayMinutes: 15, recipients: [] }, // 15 min - security head
      ],
    });

    // Default P2 escalation policy
    this.escalationPolicies.set("default:P2", {
      tenantId: "default",
      severity: "P2",
      tiers: [
        { level: 1, delayMinutes: 0, recipients: [] },
        { level: 2, delayMinutes: 15, recipients: [] },
        { level: 3, delayMinutes: 30, recipients: [] },
      ],
    });
  }

  /**
   * Subscribe to alert events for automatic push notifications
   */
  private subscribeToAlertEvents() {
    this.alertService.subscribe((event: AlertRealtimeEvent) => {
      if (event.type === "ALERT_CREATED") {
        this.handleAlertCreated(event);
      } else if (event.type === "ALERT_ACKNOWLEDGED") {
        this.cancelEscalation(event.alertId);
      } else if (event.type === "ALERT_RESOLVED") {
        this.cancelEscalation(event.alertId);
      }
    });
  }

  /**
   * Handle new alert creation
   */
  private async handleAlertCreated(event: AlertRealtimeEvent) {
    const alert = event.payload;
    
    // Only push for P1 and P2
    if (alert.severity !== "P1" && alert.severity !== "P2") {
      return;
    }

    // Get on-call operators for tenant
    const onCallOperators = await this.getOnCallOperators(event.tenantId);

    if (onCallOperators.length === 0) {
      console.warn(`[PushNotification] No on-call operators found for tenant ${event.tenantId}`);
      return;
    }

    // Send immediate notification to on-call operators
    for (const operatorId of onCallOperators) {
      await this.sendPushNotification({
        userId: operatorId,
        tenantId: event.tenantId,
        title: `${alert.severity} ${alert.detection?.type || "Alert"}`,
        body: `${alert.branch?.name || "Unknown branch"} - ${alert.camera?.name || "Unknown camera"}`,
        data: {
          alertId: event.alertId,
          severity: alert.severity,
          branchId: alert.branch?.id,
          cameraId: alert.camera?.id,
          detectionType: alert.detection?.type,
        },
        priority: "high",
        category: "alert",
        sound: alert.severity === "P1" ? "critical_alert" : "default",
        clickAction: `/mobile/incidents/${event.alertId}`,
      });
    }

    // Start escalation timer if P1
    if (alert.severity === "P1") {
      this.startEscalation(event.tenantId, event.alertId, alert);
    }
  }

  /**
   * Start escalation timer chain
   */
  private startEscalation(tenantId: string, alertId: string, alert: any) {
    const policy = this.escalationPolicies.get(`${tenantId}:P1`) 
      || this.escalationPolicies.get("default:P1")!;

    // Schedule tier 2 escalation (5 minutes)
    const timer = setTimeout(async () => {
      // Check if alert is still unacknowledged
      const currentAlert = (this.alertService as any).alerts.get(alertId);
      if (currentAlert && currentAlert.status === "NEW") {
        await this.escalateToTier(tenantId, alertId, alert, 2);
        
        // Schedule tier 3 (another 5 minutes)
        const timer2 = setTimeout(async () => {
          const currentAlert = (this.alertService as any).alerts.get(alertId);
          if (currentAlert && currentAlert.status === "NEW") {
            await this.escalateToTier(tenantId, alertId, alert, 3);
            
            // Schedule tier 4 (final escalation)
            const timer3 = setTimeout(async () => {
              const currentAlert = (this.alertService as any).alerts.get(alertId);
              if (currentAlert && currentAlert.status === "NEW") {
                await this.escalateToTier(tenantId, alertId, alert, 4);
              }
            }, 5 * 60 * 1000);
            
            this.escalationTimers.set(`${alertId}:tier3`, timer3);
          }
        }, 5 * 60 * 1000);
        
        this.escalationTimers.set(`${alertId}:tier2`, timer2);
      }
    }, 5 * 60 * 1000);

    this.escalationTimers.set(`${alertId}:tier1`, timer);

    console.log(`[PushNotification] Started P1 escalation chain for alert ${alertId}`);
  }

  /**
   * Escalate to specific tier
   */
  private async escalateToTier(
    tenantId: string,
    alertId: string,
    alert: any,
    tier: number,
  ) {
    const tierNames: Record<number, string> = {
      2: "Supervisor",
      3: "Security Manager",
      4: "Regional Security Head",
    };

    console.log(`[PushNotification] Escalating alert ${alertId} to tier ${tier}: ${tierNames[tier]}`);

    // Get tier recipients
    const recipients = await this.getTierRecipients(tenantId, tier);

    // Send escalation notifications
    for (const recipientId of recipients) {
      await this.sendPushNotification({
        userId: recipientId,
        tenantId,
        title: `🚨 P1 ESCALATION - Tier ${tier}`,
        body: `Unacknowledged P1 alert at ${alert.branch?.name || "branch"} requires immediate attention`,
        data: {
          alertId,
          severity: "P1",
          escalationTier: tier,
          branchId: alert.branch?.id,
        },
        priority: "high",
        category: "escalation",
        sound: "critical_alert",
        clickAction: `/mobile/incidents/${alertId}`,
      });
    }

    // Also notify via email/SMS if configured
    this.emit("escalation", {
      tenantId,
      alertId,
      tier,
      recipients,
      alert,
    });
  }

  /**
   * Cancel escalation when alert is acknowledged or resolved
   */
  private cancelEscalation(alertId: string) {
    const timerKeys = [`${alertId}:tier1`, `${alertId}:tier2`, `${alertId}:tier3`];
    
    for (const key of timerKeys) {
      const timer = this.escalationTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(key);
      }
    }

    console.log(`[PushNotification] Cancelled escalation chain for alert ${alertId}`);
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification(params: {
    userId: string;
    tenantId: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    priority?: "high" | "normal";
    category?: "alert" | "incident" | "assignment" | "escalation" | "sla_warning";
    sound?: string;
    badge?: number;
    clickAction?: string;
  }): Promise<PushNotificationMessage> {
    const notification: PushNotificationMessage = {
      id: `notif-${randomUUID()}`,
      userId: params.userId,
      tenantId: params.tenantId,
      title: params.title,
      body: params.body,
      data: params.data,
      priority: params.priority || "normal",
      category: params.category || "alert",
      sound: params.sound,
      badge: params.badge,
      clickAction: params.clickAction,
      status: "pending",
    };

    this.notifications.set(notification.id, notification);

    // Get user's devices
    const userDevices = Array.from(this.devices.values()).filter(
      (d) => d.userId === params.userId && d.tenantId === params.tenantId && d.isActive
    );

    if (userDevices.length === 0) {
      console.warn(`[PushNotification] No active devices found for user ${params.userId}`);
      notification.status = "failed";
      notification.errorMessage = "No active devices";
      return notification;
    }

    // Send to all devices
    const results = await Promise.allSettled(
      userDevices.map((device) => this.sendToDevice(device, notification))
    );

    // Update notification status
    const anySuccess = results.some((r) => r.status === "fulfilled" && r.value === true);
    notification.status = anySuccess ? "sent" : "failed";
    notification.sentAt = new Date();

    if (!anySuccess) {
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r: any) => r.reason?.message || "Unknown error");
      notification.errorMessage = errors.join("; ");
    }

    console.log(
      `[PushNotification] Sent ${params.category} notification to user ${params.userId}: ${notification.status}`
    );

    return notification;
  }

  /**
   * Send notification to specific device
   */
  private async sendToDevice(
    device: PushNotificationDevice,
    notification: PushNotificationMessage,
  ): Promise<boolean> {
    if (device.platform === "web") {
      return this.sendWebPush(device, notification);
    } else {
      return this.sendFCM(device, notification);
    }
  }

  /**
   * Send via Firebase Cloud Messaging (Android/iOS)
   */
  private async sendFCM(
    device: PushNotificationDevice,
    notification: PushNotificationMessage,
  ): Promise<boolean> {
    // TODO: Implement actual FCM integration
    // This requires firebase-admin SDK and service account credentials
    
    console.log(`[PushNotification] FCM: Would send to ${device.platform} device ${device.deviceToken.slice(0, 10)}...`);
    
    // Simulated FCM payload
    const fcmPayload = {
      token: device.deviceToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      android: {
        priority: notification.priority === "high" ? "high" : "normal",
        notification: {
          sound: notification.sound || "default",
          channelId: notification.category,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            sound: notification.sound || "default",
            badge: notification.badge,
            category: notification.category,
          },
        },
      },
    };

    // TODO: Replace with actual FCM call:
    // const admin = require('firebase-admin');
    // const response = await admin.messaging().send(fcmPayload);
    
    throw new Error("FCM provider is not configured");
  }

  /**
   * Send via Web Push API (PWA)
   */
  private async sendWebPush(
    device: PushNotificationDevice,
    notification: PushNotificationMessage,
  ): Promise<boolean> {
    // TODO: Implement actual Web Push integration
    // This requires web-push library and VAPID keys
    
    console.log(`[PushNotification] Web Push: Would send to endpoint ${device.endpoint?.slice(0, 50)}...`);

    // Simulated web push payload
    const webPushPayload = {
      title: notification.title,
      body: notification.body,
      icon: "/icons/sentinel-grid-icon.png",
      badge: "/icons/badge-icon.png",
      tag: notification.id,
      data: {
        ...notification.data,
        clickAction: notification.clickAction,
      },
      requireInteraction: notification.priority === "high",
      vibrate: notification.priority === "high" ? [200, 100, 200] : undefined,
    };

    // TODO: Replace with actual web push call:
    // const webpush = require('web-push');
    // await webpush.sendNotification(
    //   {
    //     endpoint: device.endpoint,
    //     keys: device.keys,
    //   },
    //   JSON.stringify(webPushPayload)
    // );

    throw new Error("Web Push provider is not configured");
  }

  /**
   * Register device for push notifications
   */
  async registerDevice(device: Omit<PushNotificationDevice, "id" | "createdAt" | "lastUsedAt">): Promise<PushNotificationDevice> {
    const newDevice: PushNotificationDevice = {
      id: `device-${randomUUID()}`,
      ...device,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    // Deactivate old devices with same token
    for (const [id, existingDevice] of this.devices.entries()) {
      if (existingDevice.deviceToken === device.deviceToken && existingDevice.userId === device.userId) {
        existingDevice.isActive = false;
      }
    }

    this.devices.set(newDevice.id, newDevice);

    console.log(`[PushNotification] Registered ${newDevice.platform} device for user ${newDevice.userId}`);

    return newDevice;
  }

  /**
   * Unregister device
   */
  async unregisterDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (device) {
      device.isActive = false;
      console.log(`[PushNotification] Unregistered device ${deviceId}`);
      return true;
    }
    return false;
  }

  /**
   * Get on-call operators for tenant
   */
  private async getOnCallOperators(tenantId: string): Promise<string[]> {
    // TODO: Integrate with actual on-call rotation service
    // For now, return users with SOC role
    const users = await this.store.listUsers(tenantId);
    return users
      .filter((u) => u.role?.includes("SOC") || u.role?.includes("Operator"))
      .map((u) => u.id);
  }

  /**
   * Get recipients for escalation tier
   */
  private async getTierRecipients(tenantId: string, tier: number): Promise<string[]> {
    // TODO: Implement actual tier recipient resolution
    // This should be based on organizational hierarchy and on-call schedules
    
    const users = await this.store.listUsers(tenantId);
    
    if (tier === 2) {
      // Supervisors
      return users.filter((u) => u.role?.includes("Supervisor")).map((u) => u.id);
    } else if (tier === 3) {
      // Managers
      return users.filter((u) => u.role?.includes("Manager")).map((u) => u.id);
    } else if (tier === 4) {
      // Security heads
      return users.filter((u) => u.role?.includes("Head") || u.role?.includes("Director")).map((u) => u.id);
    }

    return [];
  }

  /**
   * Send SLA warning notification
   */
  async sendSLAWarning(
    tenantId: string,
    alertId: string,
    severity: string,
    remainingSeconds: number,
  ) {
    const onCallOperators = await this.getOnCallOperators(tenantId);

    for (const operatorId of onCallOperators) {
      await this.sendPushNotification({
        userId: operatorId,
        tenantId,
        title: `⏰ SLA Warning - ${severity}`,
        body: `Only ${remainingSeconds}s remaining to acknowledge alert`,
        data: {
          alertId,
          severity,
          slaType: "warning",
          remainingSeconds,
        },
        priority: "high",
        category: "sla_warning",
        sound: "default",
        clickAction: `/mobile/incidents/${alertId}`,
      });
    }
  }

  /**
   * Send incident assignment notification
   */
  async sendAssignmentNotification(
    tenantId: string,
    userId: string,
    incidentId: string,
    incidentTitle: string,
    severity: string,
  ) {
    await this.sendPushNotification({
      userId,
      tenantId,
      title: `📋 Incident Assigned`,
      body: `You have been assigned: ${incidentTitle}`,
      data: {
        incidentId,
        severity,
      },
      priority: severity === "P1" ? "high" : "normal",
      category: "assignment",
      clickAction: `/mobile/incidents/${incidentId}`,
    });
  }

  /**
   * Get notification history for user
   */
  getNotificationHistory(userId: string, limit: number = 50): PushNotificationMessage[] {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => (b.sentAt?.getTime() || 0) - (a.sentAt?.getTime() || 0))
      .slice(0, limit);
  }

  /**
   * Get user devices
   */
  getUserDevices(userId: string, tenantId: string): PushNotificationDevice[] {
    return Array.from(this.devices.values()).filter(
      (d) => d.userId === userId && d.tenantId === tenantId
    );
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    // Cancel all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    console.log("[PushNotification] Service destroyed");
  }
}
