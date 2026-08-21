/**
 * Panic Button Emergency Service
 * 
 * Handles panic button events with:
 * - Instant P1 incident creation
 * - Auto-attachment of nearby camera feeds
 * - Mobile push notifications to security personnel
 * - SOC escalation workflows
 * - Emergency response coordination
 * 
 * Panic buttons are the highest priority security events requiring immediate response.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import {
  SecurityDeviceEvent,
  SecurityDevice,
  CorrelatedSecurityIncident,
} from '../types/security-device';
import { SecurityDeviceService } from './security-device.service';
import { IncidentService } from './incident.service';
import { SecurityDeviceRealtimeService } from './security-device-realtime.service';

interface PanicButtonEvent {
  id: string;
  deviceId: string;
  deviceName: string;
  branchId: string;
  branchName?: string;
  location?: string;
  triggeredAt: Date;
  triggeredBy?: string; // If known (e.g., badge scan)
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

interface NearbyCameraInfo {
  cameraId: string;
  cameraName: string;
  distance?: number; // meters
  field OfView?: string;
  streamUrl?: string;
  snapshotUrl?: string;
}

interface EmergencyResponse {
  incidentId: string;
  incidentNumber: string;
  panicEvent: PanicButtonEvent;
  attachedCameras: NearbyCameraInfo[];
  notificationsSent: string[]; // userIds
  socEscalated: boolean;
  responseTime: number; // milliseconds
}

interface EmergencyNotificationRecipient {
  userId: string;
  role: 'SECURITY_OFFICER' | 'BRANCH_MANAGER' | 'SOC_OPERATOR' | 'EMERGENCY_RESPONDER';
  notificationChannels: ('PUSH' | 'SMS' | 'VOICE' | 'EMAIL')[];
  priority: number; // 1 = highest
}

export class PanicButtonEmergencyService extends EventEmitter {
  private static instance: PanicButtonEmergencyService;
  private deviceService: SecurityDeviceService;
  private incidentService: IncidentService;
  private realtimeService: SecurityDeviceRealtimeService;
  private activeEmergencies = new Map<string, EmergencyResponse>();

  // Configuration
  private readonly NEARBY_CAMERA_RADIUS_METERS = 50; // Search radius for nearby cameras
  private readonly EMERGENCY_NOTIFICATION_TIMEOUT_MS = 5000; // Max time to send notifications
  private readonly AUTO_ESCALATION_DELAY_MS = 60000; // Auto-escalate if not acknowledged in 1 min

  private constructor(
    private readonly pool: Pool,
    private readonly redis: Redis
  ) {
    super();
    this.deviceService = SecurityDeviceService.getInstance();
    this.incidentService = new IncidentService(pool, redis);
    this.realtimeService = SecurityDeviceRealtimeService.getInstance(redis);
  }

  static getInstance(pool?: Pool, redis?: Redis): PanicButtonEmergencyService {
    if (!PanicButtonEmergencyService.instance) {
      if (!pool || !redis) {
        throw new Error('Pool and Redis required for first initialization');
      }
      PanicButtonEmergencyService.instance = new PanicButtonEmergencyService(pool, redis);
    }
    return PanicButtonEmergencyService.instance;
  }

  /**
   * Handle panic button press event
   * This is the main entry point for panic button emergencies
   */
  async handlePanicButtonPress(event: SecurityDeviceEvent): Promise<EmergencyResponse> {
    const startTime = Date.now();
    console.log(`[PANIC EMERGENCY] Button pressed: ${event.deviceId} at ${event.branchId}`);

    try {
      // Step 1: Get panic button device details
      const device = await this.deviceService.getDeviceById(event.deviceId);
      if (!device) {
        throw new Error(`Panic button device not found: ${event.deviceId}`);
      }

      // Step 2: Create panic event record
      const panicEvent: PanicButtonEvent = {
        id: `panic-${Date.now()}-${event.deviceId}`,
        deviceId: event.deviceId,
        deviceName: device.name,
        branchId: event.branchId,
        branchName: event.metadata?.branchName,
        location: device.location,
        triggeredAt: new Date(event.occurredAt),
        triggeredBy: event.metadata?.triggeredBy,
        acknowledged: false,
      };

      // Step 3: Find nearby cameras (parallel with incident creation)
      const [attachedCameras, incident] = await Promise.all([
        this.findNearbyCameras(event.branchId, device.location),
        this.createPanicIncident(panicEvent, device),
      ]);

      // Step 4: Attach camera feeds to incident
      if (attachedCameras.length > 0) {
        await this.attachCamerasToIncident(incident.id, attachedCameras);
      }

      // Step 5: Send emergency notifications (non-blocking)
      const notificationRecipients = await this.getEmergencyRecipients(event.branchId);
      const notificationsSent = await this.sendEmergencyNotifications(
        panicEvent,
        incident.incidentNumber,
        attachedCameras,
        notificationRecipients
      );

      // Step 6: SOC escalation
      const socEscalated = await this.escalateToSOC(incident.id, panicEvent);

      const response: EmergencyResponse = {
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        panicEvent,
        attachedCameras,
        notificationsSent,
        socEscalated,
        responseTime: Date.now() - startTime,
      };

      // Step 7: Track active emergency
      this.activeEmergencies.set(panicEvent.id, response);

      // Step 8: Set auto-escalation timer if not acknowledged
      this.scheduleAutoEscalation(panicEvent.id);

      // Step 9: Emit event for real-time updates
      this.emit('panic-emergency-created', response);

      // Step 10: Publish to real-time service for WebSocket clients
      await this.realtimeService.publishPanicEmergency(response);

      console.log(`[PANIC EMERGENCY] Response created in ${response.responseTime}ms: ${incident.incidentNumber}`);
      return response;
    } catch (error) {
      console.error('[PANIC EMERGENCY] Failed to handle panic button press:', error);
      
      // Even if processing fails, try to create a basic incident
      await this.createFallbackPanicIncident(event);
      
      throw error;
    }
  }

  /**
   * Find cameras near the panic button location
   */
  private async findNearbyCameras(
    branchId: string,
    location?: string
  ): Promise<NearbyCameraInfo[]> {
    try {
      // Get all cameras at the branch
      const cameras = await this.deviceService.getAllDevices({
        branchId,
        deviceType: 'ip-camera',
        status: 'online', // Only online cameras
      });

      if (!cameras || cameras.length === 0) {
        console.warn(`[PANIC EMERGENCY] No cameras found at branch ${branchId}`);
        return [];
      }

      // If location is specified, prioritize cameras near that location
      const nearbyCameras: NearbyCameraInfo[] = [];
      
      for (const camera of cameras) {
        // Check if camera location matches or is nearby
        const isNearby = this.isCameraNearLocation(camera, location);
        
        if (isNearby || nearbyCameras.length < 5) {
          // Always attach at least 5 cameras if available
          nearbyCameras.push({
            cameraId: camera.id,
            cameraName: camera.name,
            distance: this.calculateDistance(camera.location, location),
            fieldOfView: camera.metadata?.fieldOfView,
            streamUrl: this.buildStreamUrl(camera.id),
            snapshotUrl: this.buildSnapshotUrl(camera.id),
          });
        }
      }

      // Sort by distance (closest first)
      nearbyCameras.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

      // Take top 10 cameras
      return nearbyCameras.slice(0, 10);
    } catch (error) {
      console.error('[PANIC EMERGENCY] Failed to find nearby cameras:', error);
      return [];
    }
  }

  /**
   * Check if camera is near the specified location
   */
  private isCameraNearLocation(camera: SecurityDevice, location?: string): boolean {
    if (!location || !camera.location) return true; // Include if location unknown
    
    // Simple string matching for now
    // TODO: Implement geospatial matching if coordinates available
    return camera.location.toLowerCase().includes(location.toLowerCase());
  }

  /**
   * Calculate distance between two locations
   */
  private calculateDistance(location1?: string, location2?: string): number | undefined {
    if (!location1 || !location2) return undefined;
    
    // TODO: Implement actual distance calculation if coordinates available
    // For now, return undefined to indicate distance is unknown
    return undefined;
  }

  /**
   * Build live stream URL for camera
   */
  private buildStreamUrl(cameraId: string): string {
    return `/api/cameras/${cameraId}/live`;
  }

  /**
   * Build snapshot URL for camera
   */
  private buildSnapshotUrl(cameraId: string): string {
    return `/api/cameras/${cameraId}/snapshot`;
  }

  /**
   * Create P1 incident for panic event
   */
  private async createPanicIncident(
    panicEvent: PanicButtonEvent,
    device: SecurityDevice
  ): Promise<any> {
    const incident = await this.incidentService.createIncident({
      tenantId: 'system', // TODO: Get from context
      incidentType: 'PANIC_EMERGENCY',
      severity: 'P1',
      status: 'NEW',
      title: `🚨 PANIC BUTTON - ${panicEvent.location || panicEvent.branchName || 'Unknown Location'}`,
      description: this.buildPanicDescription(panicEvent, device),
      branchId: panicEvent.branchId,
      detectionSource: 'SECURITY_DEVICE',
      detectionCount: 1,
      aiConfidence: 100, // Panic button is 100% confidence
      occurredAt: panicEvent.triggeredAt,
      metadata: {
        panicEventId: panicEvent.id,
        deviceId: panicEvent.deviceId,
        deviceName: panicEvent.deviceName,
        location: panicEvent.location,
        triggeredBy: panicEvent.triggeredBy,
        emergencyType: 'PANIC_BUTTON',
        requiresImmediate Response: true,
      },
    });

    return incident;
  }

  /**
   * Build panic incident description
   */
  private buildPanicDescription(panicEvent: PanicButtonEvent, device: SecurityDevice): string {
    const parts = [
      '🚨 PANIC BUTTON ACTIVATED - IMMEDIATE RESPONSE REQUIRED',
      '',
      `Location: ${panicEvent.location || panicEvent.branchName || 'Unknown'}`,
      `Device: ${panicEvent.deviceName} (${panicEvent.deviceId})`,
      `Time: ${panicEvent.triggeredAt.toLocaleString()}`,
    ];

    if (panicEvent.triggeredBy) {
      parts.push(`Triggered by: ${panicEvent.triggeredBy}`);
    }

    parts.push('');
    parts.push('⚠️ This is a critical emergency requiring immediate security response.');
    parts.push('📹 Live camera feeds have been automatically attached to this incident.');
    parts.push('📱 Emergency notifications have been sent to on-duty security personnel.');

    return parts.join('\n');
  }

  /**
   * Attach camera feeds to incident
   */
  private async attachCamerasToIncident(
    incidentId: string,
    cameras: NearbyCameraInfo[]
  ): Promise<void> {
    try {
      const attachments = cameras.map(camera => ({
        incidentId,
        attachmentType: 'LIVE_CAMERA',
        resourceId: camera.cameraId,
        resourceName: camera.cameraName,
        metadata: {
          streamUrl: camera.streamUrl,
          snapshotUrl: camera.snapshotUrl,
          distance: camera.distance,
          fieldOfView: camera.fieldOfView,
        },
      }));

      // Store attachments in database
      for (const attachment of attachments) {
        await this.pool.query(
          `INSERT INTO incident_attachments (incident_id, attachment_type, resource_id, resource_name, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (incident_id, resource_id) DO NOTHING`,
          [
            attachment.incidentId,
            attachment.attachmentType,
            attachment.resourceId,
            attachment.resourceName,
            JSON.stringify(attachment.metadata),
          ]
        );
      }

      console.log(`[PANIC EMERGENCY] Attached ${cameras.length} cameras to incident ${incidentId}`);
    } catch (error) {
      console.error('[PANIC EMERGENCY] Failed to attach cameras:', error);
      // Don't throw - camera attachment failure shouldn't block emergency response
    }
  }

  /**
   * Get emergency notification recipients for branch
   */
  private async getEmergencyRecipients(
    branchId: string
  ): Promise<EmergencyNotificationRecipient[]> {
    try {
      // Query users with emergency response roles at the branch
      const result = await this.pool.query(
        `SELECT u.id, u.role, u.notification_preferences
         FROM users u
         JOIN user_branch_assignments uba ON u.id = uba.user_id
         WHERE uba.branch_id = $1
           AND u.role IN ('SECURITY_OFFICER', 'BRANCH_MANAGER', 'SOC_OPERATOR')
           AND u.on_duty = true
         ORDER BY 
           CASE u.role
             WHEN 'SOC_OPERATOR' THEN 1
             WHEN 'SECURITY_OFFICER' THEN 2
             WHEN 'BRANCH_MANAGER' THEN 3
           END`,
        [branchId]
      );

      const recipients: EmergencyNotificationRecipient[] = result.rows.map((row, index) => ({
        userId: row.id,
        role: row.role as any,
        notificationChannels: this.getNotificationChannels(row.role),
        priority: index + 1,
      }));

      // If no branch-specific recipients, get SOC operators
      if (recipients.length === 0) {
        const socResult = await this.pool.query(
          `SELECT id, role, notification_preferences
           FROM users
           WHERE role = 'SOC_OPERATOR' AND on_duty = true
           LIMIT 5`
        );

        return socResult.rows.map((row, index) => ({
          userId: row.id,
          role: 'SOC_OPERATOR',
          notificationChannels: ['PUSH', 'SMS', 'VOICE'],
          priority: index + 1,
        }));
      }

      return recipients;
    } catch (error) {
      console.error('[PANIC EMERGENCY] Failed to get recipients:', error);
      return [];
    }
  }

  /**
   * Get notification channels for role
   */
  private getNotificationChannels(
    role: string
  ): ('PUSH' | 'SMS' | 'VOICE' | 'EMAIL')[] {
    switch (role) {
      case 'SOC_OPERATOR':
        return ['PUSH', 'SMS', 'VOICE']; // All channels for SOC
      case 'SECURITY_OFFICER':
        return ['PUSH', 'SMS'];
      case 'BRANCH_MANAGER':
        return ['PUSH', 'EMAIL'];
      default:
        return ['PUSH'];
    }
  }

  /**
   * Send emergency notifications to recipients
   */
  private async sendEmergencyNotifications(
    panicEvent: PanicButtonEvent,
    incidentNumber: string,
    cameras: NearbyCameraInfo[],
    recipients: EmergencyNotificationRecipient[]
  ): Promise<string[]> {
    const notificationsSent: string[] = [];

    try {
      const notificationPromises = recipients.map(async (recipient) => {
        try {
          // Push notification (highest priority)
          if (recipient.notificationChannels.includes('PUSH')) {
            await this.sendPushNotification(recipient.userId, {
              title: '🚨 PANIC BUTTON ALERT',
              body: `Emergency at ${panicEvent.location || panicEvent.branchName}`,
              data: {
                type: 'PANIC_EMERGENCY',
                incidentNumber,
                panicEventId: panicEvent.id,
                branchId: panicEvent.branchId,
                location: panicEvent.location,
                cameraCount: cameras.length,
                priority: 'CRITICAL',
              },
              sound: 'emergency_alert.mp3',
              vibrate: [200, 100, 200, 100, 200],
              priority: 'high',
            });
          }

          // SMS notification
          if (recipient.notificationChannels.includes('SMS')) {
            await this.sendSmsNotification(recipient.userId, {
              message: `🚨 PANIC BUTTON: ${panicEvent.location || panicEvent.branchName}. Incident ${incidentNumber}. Respond immediately.`,
              priority: 'URGENT',
            });
          }

          // Voice call (for SOC only)
          if (recipient.role === 'SOC_OPERATOR' && recipient.notificationChannels.includes('VOICE')) {
            await this.initiateVoiceCall(recipient.userId, {
              message: `This is an emergency alert. Panic button activated at ${panicEvent.location || panicEvent.branchName}. Incident number ${incidentNumber}. Immediate response required.`,
            });
          }

          notificationsSent.push(recipient.userId);
        } catch (error) {
          console.error(`[PANIC EMERGENCY] Failed to notify user ${recipient.userId}:`, error);
          // Continue with other recipients
        }
      });

      // Wait for all notifications with timeout
      await Promise.race([
        Promise.allSettled(notificationPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Notification timeout')), this.EMERGENCY_NOTIFICATION_TIMEOUT_MS)
        ),
      ]);

      console.log(`[PANIC EMERGENCY] Sent ${notificationsSent.length} notifications`);
      return notificationsSent;
    } catch (error) {
      console.error('[PANIC EMERGENCY] Notification sending failed:', error);
      return notificationsSent;
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(userId: string, payload: any): Promise<void> {
    // TODO: Integrate with MobilePushNotificationService
    await this.redis.publish(
      'mobile-push-notifications',
      JSON.stringify({ userId, ...payload })
    );
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(userId: string, payload: any): Promise<void> {
    // TODO: Integrate with Twilio SMS service
    console.log(`[SMS] Sending to user ${userId}: ${payload.message}`);
  }

  /**
   * Initiate voice call
   */
  private async initiateVoiceCall(userId: string, payload: any): Promise<void> {
    // TODO: Integrate with Twilio Voice service
    console.log(`[VOICE] Calling user ${userId}: ${payload.message}`);
  }

  /**
   * Escalate to SOC
   */
  private async escalateToSOC(incidentId: string, panicEvent: PanicButtonEvent): Promise<boolean> {
    try {
      // Mark incident as SOC escalated
      await this.pool.query(
        `UPDATE incidents
         SET 
           escalation_level = 'SOC',
           escalated_at = NOW(),
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{socEscalated}', 'true'::jsonb)
         WHERE id = $1`,
        [incidentId]
      );

      // Publish to SOC event stream
      await this.redis.publish(
        'soc-escalations',
        JSON.stringify({
          type: 'PANIC_EMERGENCY',
          incidentId,
          panicEventId: panicEvent.id,
          branchId: panicEvent.branchId,
          location: panicEvent.location,
          triggeredAt: panicEvent.triggeredAt,
          requiresImmediateResponse: true,
        })
      );

      console.log(`[PANIC EMERGENCY] Escalated to SOC: ${incidentId}`);
      return true;
    } catch (error) {
      console.error('[PANIC EMERGENCY] SOC escalation failed:', error);
      return false;
    }
  }

  /**
   * Schedule auto-escalation if not acknowledged
   */
  private scheduleAutoEscalation(panicEventId: string): void {
    const timer = setTimeout(async () => {
      const emergency = this.activeEmergencies.get(panicEventId);
      if (emergency && !emergency.panicEvent.acknowledged) {
        console.warn(`[PANIC EMERGENCY] Auto-escalating unacknowledged panic: ${panicEventId}`);
        await this.autoEscalate(emergency);
      }
    }, this.AUTO_ESCALATION_DELAY_MS);

    // Store timer for cancellation if acknowledged
    this.redis.set(`panic-escalation-timer:${panicEventId}`, timer.toString(), 'EX', 300);
  }

  /**
   * Auto-escalate unacknowledged panic event
   */
  private async autoEscalate(emergency: EmergencyResponse): Promise<void> {
    try {
      // Send escalation notifications to higher authority
      await this.sendEscalationNotifications(emergency);

      // Update incident priority
      await this.pool.query(
        `UPDATE incidents
         SET 
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{autoEscalated}', 'true'::jsonb),
           updated_at = NOW()
         WHERE id = $1`,
        [emergency.incidentId]
      );

      this.emit('panic-emergency-escalated', emergency);
    } catch (error) {
      console.error('[PANIC EMERGENCY] Auto-escalation failed:', error);
    }
  }

  /**
   * Send escalation notifications
   */
  private async sendEscalationNotifications(emergency: EmergencyResponse): Promise<void> {
    // Notify senior management
    const seniorManagement = await this.pool.query(
      `SELECT id FROM users WHERE role IN ('SECURITY_DIRECTOR', 'OPERATIONS_MANAGER') AND on_duty = true LIMIT 5`
    );

    for (const user of seniorManagement.rows) {
      await this.sendPushNotification(user.id, {
        title: '🚨 ESCALATED: Unacknowledged Panic Alert',
        body: `Panic button at ${emergency.panicEvent.location} - No response for 1 minute`,
        data: {
          type: 'PANIC_ESCALATION',
          incidentNumber: emergency.incidentNumber,
          panicEventId: emergency.panicEvent.id,
        },
        priority: 'high',
      });
    }
  }

  /**
   * Acknowledge panic event
   */
  async acknowledgePanic(panicEventId: string, userId: string): Promise<void> {
    const emergency = this.activeEmergencies.get(panicEventId);
    if (!emergency) {
      throw new Error('Panic event not found');
    }

    emergency.panicEvent.acknowledged = true;
    emergency.panicEvent.acknowledgedAt = new Date();
    emergency.panicEvent.acknowledgedBy = userId;

    // Update incident
    await this.incidentService.acknowledgeIncident('system', emergency.incidentId, userId);

    // Cancel auto-escalation timer
    await this.redis.del(`panic-escalation-timer:${panicEventId}`);

    this.emit('panic-emergency-acknowledged', { emergency, userId });
    
    // Publish to real-time service
    await this.realtimeService.publishPanicAcknowledgement(panicEventId, userId, emergency);
    
    console.log(`[PANIC EMERGENCY] Acknowledged by ${userId}: ${panicEventId}`);
  }

  /**
   * Create fallback panic incident if main flow fails
   */
  private async createFallbackPanicIncident(event: SecurityDeviceEvent): Promise<void> {
    try {
      await this.incidentService.createIncident({
        tenantId: 'system',
        incidentType: 'PANIC_EMERGENCY',
        severity: 'P1',
        status: 'NEW',
        title: '🚨 PANIC BUTTON - Processing Error',
        description: `Panic button event detected but processing failed. Manual investigation required.\n\nDevice: ${event.deviceId}\nBranch: ${event.branchId}\nTime: ${new Date(event.occurredAt).toLocaleString()}`,
        branchId: event.branchId,
        detectionSource: 'SECURITY_DEVICE',
        occurredAt: new Date(event.occurredAt),
      });
    } catch (error) {
      console.error('[PANIC EMERGENCY] Fallback incident creation failed:', error);
    }
  }

  /**
   * Get active emergencies
   */
  getActiveEmergencies(): EmergencyResponse[] {
    return Array.from(this.activeEmergencies.values());
  }

  /**
   * Get emergency by ID
   */
  getEmergency(panicEventId: string): EmergencyResponse | undefined {
    return this.activeEmergencies.get(panicEventId);
  }
}
