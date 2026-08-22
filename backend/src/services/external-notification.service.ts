import { EventEmitter } from 'events';
import { Pool } from 'pg';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

/**
 * External Notification Service
 * Manages secure notifications to external systems including police and emergency services
 */

interface NotificationRequest {
  incidentId: string;
  externalEventId?: string;
  notificationType: 'police' | 'emergency' | 'central-monitoring' | 'vendor';
  recipientSystem: string;
  priority: 'routine' | 'urgent' | 'emergency';
  messageSubject: string;
  messageBody: string;
  attachments?: any[];
  deliveryMethod: 'api' | 'webhook' | 'email' | 'sms' | 'secure-link';
  approvedBy?: string;
}

interface PoliceNotificationRequest {
  incidentId: string;
  policeStation: string;
  contactPerson?: string;
  contactNumber?: string;
  notificationModel: 'assisted' | 'secure-message' | 'dedicated-link';
  approvalLevel: 'operator' | 'supervisor' | 'emergency-override';
}

interface SecureLiveShareRequest {
  incidentId: string;
  recipientOrganization: string;
  recipientContact: string;
  purpose: string;
  cameraIds: string[];
  allowPtz: boolean;
  allowHistorical: boolean;
  watermarkText: string;
  expiryMinutes: number;
  approvedBy: string;
}

export class ExternalNotificationService extends EventEmitter {
  private pool: Pool;
  private policeEndpoints: Map<string, string> = new Map();
  private notificationQueue: Map<string, any> = new Map();

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.initializePoliceEndpoints();
  }

  /**
   * Initialize police endpoints from configuration
   */
  private async initializePoliceEndpoints(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT config_json->>'policeStation' as station,
               config_json->>'endpoint' as endpoint
        FROM integration_connectors
        WHERE connector_type = 'police-interface'
        AND status = 'active'
      `);

      for (const row of result.rows) {
        if (row.station && row.endpoint) {
          this.policeEndpoints.set(row.station, row.endpoint);
        }
      }

      logger.info('Police endpoints initialized', {
        count: this.policeEndpoints.size
      });
    } catch (error) {
      logger.error('Error initializing police endpoints', { error });
    }
  }

  /**
   * Send external notification
   */
  async sendNotification(request: NotificationRequest): Promise<string> {
    try {
      // Verify approval if required
      if (request.priority === 'emergency' && !request.approvedBy) {
        throw new Error('Emergency notifications require approval');
      }

      // Create notification record
      const result = await this.pool.query(
        `INSERT INTO external_notifications 
         (notification_type, recipient_system, incident_id, external_event_id,
          priority, message_subject, message_body, attachments_json,
          delivery_method, approved_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          request.notificationType,
          request.recipientSystem,
          request.incidentId,
          request.externalEventId,
          request.priority,
          request.messageSubject,
          request.messageBody,
          JSON.stringify(request.attachments || []),
          request.deliveryMethod,
          request.approvedBy,
          request.approvedBy // Simplified, should be from context
        ]
      );

      const notificationId = result.rows[0].id;

      // Queue for delivery
      this.notificationQueue.set(notificationId, request);

      // Deliver based on method
      await this.deliverNotification(notificationId, request);

      // Audit log
      await this.pool.query(
        `INSERT INTO integration_audit_log 
         (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['notification', 'external_notification', notificationId, 'sent', request.approvedBy]
      );

      logger.info('External notification sent', {
        notificationId,
        type: request.notificationType,
        priority: request.priority
      });

      return notificationId;
    } catch (error) {
      logger.error('Error sending external notification', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Deliver notification based on method
   */
  private async deliverNotification(
    notificationId: string,
    request: NotificationRequest
  ): Promise<void> {
    try {
      let delivered = false;
      let externalReference = '';

      switch (request.deliveryMethod) {
        case 'api':
          const apiResult = await this.deliverViaAPI(request);
          delivered = apiResult.success;
          externalReference = apiResult.reference;
          break;

        case 'webhook':
          const webhookResult = await this.deliverViaWebhook(request);
          delivered = webhookResult.success;
          break;

        case 'email':
          delivered = await this.deliverViaEmail(request);
          break;

        case 'sms':
          delivered = await this.deliverViaSMS(request);
          break;

        case 'secure-link':
          const linkResult = await this.deliverViaSecureLink(request);
          delivered = linkResult.success;
          externalReference = linkResult.link;
          break;
      }

      // Update notification status
      await this.pool.query(
        `UPDATE external_notifications 
         SET delivery_status = $1,
             sent_at = CURRENT_TIMESTAMP,
             external_reference = $2
         WHERE id = $3`,
        [delivered ? 'sent' : 'failed', externalReference, notificationId]
      );

      if (delivered) {
        this.notificationQueue.delete(notificationId);
        this.emit('notification:delivered', { notificationId, request });
      } else {
        this.emit('notification:failed', { notificationId, request });
      }
    } catch (error) {
      logger.error('Error delivering notification', {
        notificationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      await this.pool.query(
        `UPDATE external_notifications 
         SET delivery_status = 'failed'
         WHERE id = $1`,
        [notificationId]
      );
    }
  }

  /**
   * Send police notification (Model A - Assisted)
   */
  async sendPoliceNotificationAssisted(request: PoliceNotificationRequest): Promise<string> {
    try {
      // Get incident details
      const incidentResult = await this.pool.query(
        `SELECT i.*, b.name as branch_name, b.address as branch_address
         FROM incidents i
         JOIN branches b ON b.id = i.branch_id
         WHERE i.id = $1`,
        [request.incidentId]
      );

      if (incidentResult.rows.length === 0) {
        throw new Error('Incident not found');
      }

      const incident = incidentResult.rows[0];

      // Create police notification record
      const result = await this.pool.query(
        `INSERT INTO police_notifications 
         (incident_id, police_station, contact_person, contact_number,
          notification_model, approval_level)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          request.incidentId,
          request.policeStation,
          request.contactPerson,
          request.contactNumber,
          request.notificationModel,
          request.approvalLevel
        ]
      );

      const policeNotificationId = result.rows[0].id;

      // Prepare notification panel data
      const notificationData = {
        incidentReference: incident.incident_id,
        incidentType: incident.incident_type,
        branchName: incident.branch_name,
        branchAddress: incident.branch_address,
        occurredAt: incident.created_at,
        currentStatus: incident.status,
        policeStation: request.policeStation,
        contactNumber: request.contactNumber,
        urgency: this.determineUrgency(incident)
      };

      // Emit for UI display
      this.emit('police:notification-prepared', {
        policeNotificationId,
        notificationData
      });

      logger.info('Police notification prepared (assisted model)', {
        policeNotificationId,
        incidentId: request.incidentId,
        station: request.policeStation
      });

      return policeNotificationId;
    } catch (error) {
      logger.error('Error creating police notification', { error });
      throw error;
    }
  }

  /**
   * Send police notification (Model B - Secure Message)
   */
  async sendPoliceNotificationSecure(request: PoliceNotificationRequest): Promise<string> {
    try {
      const endpoint = this.policeEndpoints.get(request.policeStation);
      
      if (!endpoint) {
        throw new Error(`No endpoint configured for police station: ${request.policeStation}`);
      }

      // Get incident details
      const incidentResult = await this.pool.query(
        `SELECT i.*, b.name as branch_name, b.address as branch_address, b.latitude, b.longitude
         FROM incidents i
         JOIN branches b ON b.id = i.branch_id
         WHERE i.id = $1`,
        [request.incidentId]
      );

      const incident = incidentResult.rows[0];

      // Prepare secure message (minimum necessary information)
      const secureMessage = {
        referenceNumber: incident.incident_id,
        timestamp: new Date().toISOString(),
        organization: 'Aditi Sentinel',
        location: {
          name: incident.branch_name,
          address: incident.branch_address,
          coordinates: {
            latitude: incident.latitude,
            longitude: incident.longitude
          }
        },
        incidentType: incident.incident_type,
        severity: incident.priority,
        currentThreatStatus: this.assessThreatStatus(incident),
        emergencyContact: await this.getEmergencyContact(incident.branch_id),
        requestingOfficer: request.contactPerson
      };

      // Send to police endpoint
      const response = await axios.post(endpoint, secureMessage, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': this.generateSignature(secureMessage),
          'X-Timestamp': new Date().toISOString()
        },
        timeout: 10000
      });

      // Update police notification with response
      await this.pool.query(
        `UPDATE police_notifications 
         SET police_reference_number = $1,
             police_response_time = CURRENT_TIMESTAMP
         WHERE incident_id = $2`,
        [response.data.referenceNumber, request.incidentId]
      );

      logger.info('Police notification sent (secure message model)', {
        incidentId: request.incidentId,
        policeReference: response.data.referenceNumber
      });

      return response.data.referenceNumber;
    } catch (error) {
      logger.error('Error sending secure police notification', { error });
      throw error;
    }
  }

  /**
   * Create secure live share for external viewing
   */
  async createSecureLiveShare(request: SecureLiveShareRequest): Promise<string> {
    try {
      // Validate cameras exist and are accessible
      const camerasResult = await this.pool.query(
        `SELECT id FROM cameras WHERE id = ANY($1::uuid[])`,
        [request.cameraIds]
      );

      if (camerasResult.rows.length !== request.cameraIds.length) {
        throw new Error('Some cameras not found or inaccessible');
      }

      // Generate secure token
      const shareToken = this.generateSecureToken();

      // Calculate expiry
      const expiresAt = new Date(Date.now() + request.expiryMinutes * 60000);

      // Create secure share
      const result = await this.pool.query(
        `INSERT INTO secure_live_shares 
         (share_token, incident_id, recipient_organization, recipient_contact,
          purpose, camera_ids, allow_ptz, allow_historical, watermark_text,
          expires_at, created_by, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          shareToken,
          request.incidentId,
          request.recipientOrganization,
          request.recipientContact,
          request.purpose,
          request.cameraIds,
          request.allowPtz,
          request.allowHistorical,
          request.watermarkText,
          expiresAt,
          request.approvedBy,
          request.approvedBy
        ]
      );

      const shareId = result.rows[0].id;

      // Audit log
      await this.pool.query(
        `INSERT INTO integration_audit_log 
         (audit_type, entity_type, entity_id, action, actor_id, details_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'notification',
          'secure_live_share',
          shareId,
          'created',
          request.approvedBy,
          JSON.stringify({
            recipientOrganization: request.recipientOrganization,
            cameraCount: request.cameraIds.length,
            expiresAt
          })
        ]
      );

      logger.info('Secure live share created', {
        shareId,
        incidentId: request.incidentId,
        recipient: request.recipientOrganization,
        cameraCount: request.cameraIds.length,
        expiresAt
      });

      // Return shareable URL
      return `${process.env.PUBLIC_URL}/live-share/${shareToken}`;
    } catch (error) {
      logger.error('Error creating secure live share', { error });
      throw error;
    }
  }

  /**
   * Revoke secure live share
   */
  async revokeSecureLiveShare(shareId: string, revokedBy: string, reason: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE secure_live_shares 
         SET revoked_at = CURRENT_TIMESTAMP,
             revoked_by = $1,
             revocation_reason = $2
         WHERE id = $3`,
        [revokedBy, reason, shareId]
      );

      // Audit log
      await this.pool.query(
        `INSERT INTO integration_audit_log 
         (audit_type, entity_type, entity_id, action, actor_id, details_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['notification', 'secure_live_share', shareId, 'revoked', revokedBy, JSON.stringify({ reason })]
      );

      logger.info('Secure live share revoked', { shareId, revokedBy, reason });
    } catch (error) {
      logger.error('Error revoking secure live share', { error });
      throw error;
    }
  }

  /**
   * Acknowledge external notification
   */
  async acknowledgeNotification(notificationId: string, externalReference?: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE external_notifications 
         SET delivery_status = 'acknowledged',
             acknowledged_at = CURRENT_TIMESTAMP,
             external_reference = COALESCE($1, external_reference)
         WHERE id = $2`,
        [externalReference, notificationId]
      );

      this.emit('notification:acknowledged', { notificationId, externalReference });

      logger.info('Notification acknowledged', { notificationId, externalReference });
    } catch (error) {
      logger.error('Error acknowledging notification', { error });
    }
  }

  // Helper methods

  private async deliverViaAPI(request: NotificationRequest): Promise<{ success: boolean; reference: string }> {
    // Implementation for API delivery
    return { success: true, reference: `API-${Date.now()}` };
  }

  private async deliverViaWebhook(request: NotificationRequest): Promise<{ success: boolean }> {
    // Implementation for webhook delivery
    return { success: true };
  }

  private async deliverViaEmail(request: NotificationRequest): Promise<boolean> {
    // Implementation for email delivery
    return true;
  }

  private async deliverViaSMS(request: NotificationRequest): Promise<boolean> {
    // Implementation for SMS delivery
    return true;
  }

  private async deliverViaSecureLink(request: NotificationRequest): Promise<{ success: boolean; link: string }> {
    // Implementation for secure link delivery
    return { success: true, link: `https://secure.example.com/${uuidv4()}` };
  }

  private determineUrgency(incident: any): string {
    if (incident.priority === 'P1') return 'immediate';
    if (incident.priority === 'P2') return 'urgent';
    return 'normal';
  }

  private assessThreatStatus(incident: any): string {
    // Assess current threat level
    if (incident.incident_type === 'robbery' || incident.incident_type === 'assault') {
      return 'active-threat';
    }
    if (incident.incident_type === 'fire') {
      return 'emergency-evacuation';
    }
    return 'under-investigation';
  }

  private async getEmergencyContact(branchId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT emergency_contact FROM branches WHERE id = $1`,
      [branchId]
    );
    return result.rows[0]?.emergency_contact || 'N/A';
  }

  private generateSignature(data: any): string {
    const crypto = require('crypto');
    const secret = process.env.POLICE_API_SECRET || 'default-secret';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
  }

  private generateSecureToken(): string {
    return `SLS-${uuidv4()}-${Date.now()}`;
  }
}
