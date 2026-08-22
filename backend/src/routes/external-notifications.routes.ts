import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { ExternalNotificationService } from '../services/external-notification.service';
import { logger } from '../utils/logger';

export function createExternalNotificationsRoutes(pool: Pool): Router {
  const router = Router();
  const notificationService = new ExternalNotificationService(pool);

  // Send police notification (assisted model)
  router.post('/incidents/:id/police-notifications', 
    authenticate, 
    authorize('police-notification:create'), 
    async (req, res) => {
      try {
        const { id: incidentId } = req.params;
        const {
          policeStation,
          contactPerson,
          contactNumber,
          notificationModel,
          approvalLevel
        } = req.body;

        const policeNotificationId = await notificationService.sendPoliceNotificationAssisted({
          incidentId,
          policeStation,
          contactPerson,
          contactNumber,
          notificationModel: notificationModel || 'assisted',
          approvalLevel: approvalLevel || 'operator'
        });

        res.status(201).json({
          success: true,
          data: { id: policeNotificationId }
        });
      } catch (error) {
        logger.error('Error creating police notification', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to create police notification'
        });
      }
    }
  );

  // Send secure police notification (Model B)
  router.post('/incidents/:id/police-notifications/secure',
    authenticate,
    authorize('police-notification:approve'),
    async (req, res) => {
      try {
        const { id: incidentId } = req.params;
        const {
          policeStation,
          contactPerson,
          contactNumber
        } = req.body;

        const referenceNumber = await notificationService.sendPoliceNotificationSecure({
          incidentId,
          policeStation,
          contactPerson,
          contactNumber,
          notificationModel: 'secure-message',
          approvalLevel: 'supervisor'
        });

        res.status(201).json({
          success: true,
          data: { referenceNumber }
        });
      } catch (error) {
        logger.error('Error sending secure police notification', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to send secure police notification'
        });
      }
    }
  );

  // Create secure live share
  router.post('/incidents/:id/secure-live-share',
    authenticate,
    authorize('secure-live-share:create'),
    async (req, res) => {
      try {
        const { id: incidentId } = req.params;
        const {
          recipientOrganization,
          recipientContact,
          purpose,
          cameraIds,
          allowPtz,
          allowHistorical,
          watermarkText,
          expiryMinutes
        } = req.body;

        // Validate required fields
        if (!recipientOrganization || !purpose || !cameraIds || cameraIds.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields'
          });
        }

        const shareUrl = await notificationService.createSecureLiveShare({
          incidentId,
          recipientOrganization,
          recipientContact: recipientContact || 'N/A',
          purpose,
          cameraIds,
          allowPtz: allowPtz || false,
          allowHistorical: allowHistorical || false,
          watermarkText: watermarkText || `${recipientOrganization} - Authorized Access Only`,
          expiryMinutes: expiryMinutes || 60,
          approvedBy: req.user.id
        });

        res.status(201).json({
          success: true,
          data: { shareUrl }
        });
      } catch (error) {
        logger.error('Error creating secure live share', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to create secure live share'
        });
      }
    }
  );

  // Revoke secure live share
  router.delete('/secure-live-shares/:id',
    authenticate,
    authorize('secure-live-share:revoke'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;

        await notificationService.revokeSecureLiveShare(
          id,
          req.user.id,
          reason || 'Manually revoked'
        );

        res.json({
          success: true,
          message: 'Secure live share revoked'
        });
      } catch (error) {
        logger.error('Error revoking secure live share', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to revoke secure live share'
        });
      }
    }
  );

  // Get active secure live shares
  router.get('/secure-live-shares',
    authenticate,
    authorize('secure-live-share:create'),
    async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT 
            sls.*,
            i.incident_id as incident_reference,
            i.title as incident_title
          FROM secure_live_shares sls
          LEFT JOIN incidents i ON i.id = sls.incident_id
          WHERE sls.revoked_at IS NULL
          AND sls.expires_at > CURRENT_TIMESTAMP
          ORDER BY sls.created_at DESC
        `);

        res.json({
          success: true,
          data: result.rows
        });
      } catch (error) {
        logger.error('Error fetching secure live shares', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch secure live shares'
        });
      }
    }
  );

  // Send general external notification
  router.post('/notifications',
    authenticate,
    async (req, res) => {
      try {
        const {
          incidentId,
          notificationType,
          recipientSystem,
          priority,
          messageSubject,
          messageBody,
          deliveryMethod
        } = req.body;

        const notificationId = await notificationService.sendNotification({
          incidentId,
          notificationType,
          recipientSystem,
          priority: priority || 'routine',
          messageSubject,
          messageBody,
          deliveryMethod: deliveryMethod || 'email',
          approvedBy: req.user.id
        });

        res.status(201).json({
          success: true,
          data: { id: notificationId }
        });
      } catch (error) {
        logger.error('Error sending notification', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to send notification'
        });
      }
    }
  );

  // Get police notifications
  router.get('/police-notifications',
    authenticate,
    authorize('police-notification:view'),
    async (req, res) => {
      try {
        const { incidentId, status } = req.query;

        let query = `
          SELECT 
            pn.*,
            i.incident_id as incident_reference,
            i.title as incident_title,
            i.incident_type,
            b.name as branch_name
          FROM police_notifications pn
          JOIN incidents i ON i.id = pn.incident_id
          LEFT JOIN branches b ON b.id = i.branch_id
          WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (incidentId) {
          query += ` AND pn.incident_id = $${paramIndex++}`;
          params.push(incidentId);
        }

        query += ` ORDER BY pn.created_at DESC LIMIT 100`;

        const result = await pool.query(query, params);

        res.json({
          success: true,
          data: result.rows
        });
      } catch (error) {
        logger.error('Error fetching police notifications', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch police notifications'
        });
      }
    }
  );

  return router;
}
