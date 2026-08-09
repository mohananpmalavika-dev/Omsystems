/**
 * Security Dashboard API Routes (Fastify)
 * Comprehensive REST APIs for all security services
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { SecurityServicesFactory } from '../security/services/index.js';
import { SecurityMonitor } from '../security/monitoring/security-monitor.js';

export async function registerSecurityDashboardRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const securityServices = SecurityServicesFactory.getInstance();
  const securityMonitor = SecurityMonitor.getInstance();

  // ============================================================================
  // Security Posture APIs
  // ============================================================================

  /**
   * GET /v1/security/posture
   * Get overall security posture with collector metrics
   */
  app.get('/v1/security/posture', async (request, reply) => {
    try {
      const securityPosture = securityServices.securityPosture;
      
      if (!securityPosture) {
        return reply.code(503).send({
          available: false,
          provenance: 'UNAVAILABLE',
          reason: 'security_posture_collectors_not_configured',
          overallScore: 0,
          timestamp: new Date().toISOString(),
          message: 'Security posture service not initialized',
        });
      }

      const posture = await securityPosture.getPosture();
      
      return {
        available: true,
        provenance: 'LIVE',
        ...posture,
        collectors: {
          certificate: !!securityServices.certificateManagement,
          secretVault: !!securityServices.secretVault,
          passwordRotation: !!securityServices.passwordRotation,
          tpm: !!securityServices.hsm,
          zeroTrust: !!securityServices.zeroTrust,
          secureBoot: true, // Placeholder
          ransomware: true, // Placeholder
          tamper: true, // Placeholder
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Security posture calculation failed');
      return reply.code(500).send({
        available: false,
        reason: 'calculation_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /v1/security/posture/calculate
   * Recalculate security posture
   */
  app.post('/v1/security/posture/calculate', async (request, reply) => {
    try {
      const securityPosture = securityServices.securityPosture;
      
      if (!securityPosture) {
        return reply.code(503).send({
          error: 'security_posture_service_not_initialized',
        });
      }

      const posture = await securityPosture.calculatePosture();
      
      return { data: posture, calculatedAt: new Date().toISOString() };
    } catch (error) {
      app.log.error({ error }, 'Security posture recalculation failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'calculation_failed',
      });
    }
  });

  /**
   * GET /v1/security/posture/history
   * Get security posture history
   */
  app.get('/v1/security/posture/history', async (request, reply) => {
    const query = z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
    }).parse(request.query);

    try {
      const securityPosture = securityServices.securityPosture;
      
      if (!securityPosture) {
        return reply.code(503).send({
          error: 'security_posture_service_not_initialized',
        });
      }

      const history = await securityPosture.getPostureHistory(query.days);
      
      return { data: history, days: query.days };
    } catch (error) {
      app.log.error({ error }, 'Security posture history retrieval failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'history_retrieval_failed',
      });
    }
  });

  /**
   * GET /v1/security/issues
   * List security issues
   */
  app.get('/v1/security/issues', async (request, reply) => {
    const query = z.object({
      category: z.string().optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      resolved: z.coerce.boolean().optional(),
    }).parse(request.query);

    try {
      const securityPosture = securityServices.securityPosture;
      
      if (!securityPosture) {
        return reply.code(503).send({
          error: 'security_posture_service_not_initialized',
        });
      }

      const issues = await securityPosture.listIssues(query);
      
      return { data: issues };
    } catch (error) {
      app.log.error({ error }, 'Security issues retrieval failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'issues_retrieval_failed',
      });
    }
  });

  /**
   * POST /v1/security/issues/:id/resolve
   * Resolve security issue
   */
  app.post('/v1/security/issues/:issueId/resolve', async (request, reply) => {
    const params = z.object({
      issueId: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      notes: z.string().optional(),
    }).parse(request.body);

    try {
      const securityPosture = securityServices.securityPosture;
      
      if (!securityPosture) {
        return reply.code(503).send({
          error: 'security_posture_service_not_initialized',
        });
      }

      await securityPosture.resolveIssue(params.issueId, request.currentUser.id);
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'security.issue_resolved',
        resourceNodeId: null,
        outcome: 'success',
        details: { issueId: params.issueId, notes: body.notes },
      });

      return {
        message: 'Security issue resolved',
        issueId: params.issueId,
        resolvedBy: request.currentUser.id,
        resolvedAt: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, issueId: params.issueId }, 'Security issue resolution failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'resolution_failed',
      });
    }
  });

  // ============================================================================
  // Certificate Management APIs
  // ============================================================================

  /**
   * GET /v1/security/certificates
   * List certificates
   */
  app.get('/v1/security/certificates', async (request, reply) => {
    const query = z.object({
      status: z.enum(['valid', 'expiring_soon', 'expired', 'revoked']).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    try {
      const certificateManagement = securityServices.certificateManagement;
      
      if (!certificateManagement) {
        return reply.code(503).send({
          error: 'certificate_management_service_not_initialized',
        });
      }

      const certificates = await certificateManagement.listCertificates(query);
      
      return { data: certificates };
    } catch (error) {
      app.log.error({ error }, 'Certificate listing failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'certificate_listing_failed',
      });
    }
  });

  /**
   * GET /v1/security/certificates/:id
   * Get certificate details
   */
  app.get('/v1/security/certificates/:certificateId', async (request, reply) => {
    const params = z.object({
      certificateId: z.string(),
    }).parse(request.params);

    try {
      const certificateManagement = securityServices.certificateManagement;
      
      if (!certificateManagement) {
        return reply.code(503).send({
          error: 'certificate_management_service_not_initialized',
        });
      }

      const certificate = await certificateManagement.getCertificate(params.certificateId);
      
      if (!certificate) {
        return reply.code(404).send({ error: 'certificate_not_found' });
      }

      return { data: certificate };
    } catch (error) {
      app.log.error({ error, certificateId: params.certificateId }, 'Certificate retrieval failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'certificate_retrieval_failed',
      });
    }
  });

  // ============================================================================
  // Security Health Check
  // ============================================================================

  /**
   * GET /v1/security/health
   * Get security services health status
   */
  app.get('/v1/security/health', async (request, reply) => {
    try {
      const health = await securityServices.healthCheck();
      
      const allHealthy = Object.values(health).every(
        (service: any) => service?.status === 'healthy' || service?.status === 'ok'
      );

      return {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        services: health,
        monitoring: {
          running: securityMonitor ? true : false,
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Security health check failed');
      return reply.code(500).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'health_check_failed',
      });
    }
  });

  /**
   * GET /v1/security/collectors/status
   * Get status of all security collectors
   */
  app.get('/v1/security/collectors/status', async (request, reply) => {
    try {
      return {
        collectors: [
          {
            name: 'Certificate Collector',
            type: 'certificate',
            enabled: !!securityServices.certificateManagement,
            status: securityServices.certificateManagement ? 'active' : 'inactive',
            description: 'Monitors TLS/SSH certificates for expiration and strength',
          },
          {
            name: 'Secret Vault Collector',
            type: 'secret_vault',
            enabled: !!securityServices.secretVault,
            status: securityServices.secretVault ? 'active' : 'inactive',
            description: 'Tracks secrets and vault compliance',
          },
          {
            name: 'Password Rotation Collector',
            type: 'password_rotation',
            enabled: !!securityServices.passwordRotation,
            status: securityServices.passwordRotation ? 'active' : 'inactive',
            description: 'Monitors password rotation schedules',
          },
          {
            name: 'TPM/HSM Collector',
            type: 'tpm',
            enabled: !!securityServices.hsm,
            status: securityServices.hsm ? 'active' : 'inactive',
            description: 'Queries TPM/HSM for attestation and key presence',
          },
          {
            name: 'Zero Trust Policy Engine',
            type: 'zero_trust',
            enabled: !!securityServices.zeroTrust,
            status: securityServices.zeroTrust ? 'active' : 'inactive',
            description: 'Evaluates access decisions and risk scores',
          },
          {
            name: 'Secure Boot Collector',
            type: 'secure_boot',
            enabled: false, // TODO: Implement
            status: 'not_configured',
            description: 'Verifies UEFI Secure Boot status',
          },
          {
            name: 'Ransomware Detector',
            type: 'ransomware',
            enabled: false, // TODO: Implement
            status: 'not_configured',
            description: 'Monitors for ransomware indicators',
          },
          {
            name: 'Tamper Detector',
            type: 'tamper',
            enabled: false, // TODO: Implement
            status: 'not_configured',
            description: 'Detects device tampering events',
          },
        ],
        summary: {
          total: 8,
          active: [
            securityServices.certificateManagement,
            securityServices.secretVault,
            securityServices.passwordRotation,
            securityServices.hsm,
            securityServices.zeroTrust,
          ].filter(Boolean).length,
          inactive: 8 - [
            securityServices.certificateManagement,
            securityServices.secretVault,
            securityServices.passwordRotation,
            securityServices.hsm,
            securityServices.zeroTrust,
          ].filter(Boolean).length,
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Collector status retrieval failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'status_retrieval_failed',
      });
    }
  });

  // ============================================================================
  // Test & Diagnostic Endpoints
  // ============================================================================

  /**
   * POST /v1/security/test/generate-alert
   * Generate test security alerts for verification
   */
  app.post('/v1/security/test/generate-alert', async (request, reply) => {
    const body = z.object({
      alertType: z.enum([
        'certificate_expiring',
        'certificate_expired',
        'secret_rotation_failed',
        'tpm_attestation_failed',
        'zero_trust_high_risk',
        'security_score_low',
        'ransomware_detected',
        'tamper_detected',
      ]).default('certificate_expiring'),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('high'),
    }).parse(request.body ?? {});

    try {
      const alertId = `test-sec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      const alertTemplates = {
        certificate_expiring: {
          type: 'certificate_expiring',
          title: 'Certificate Expiring Soon',
          description: 'SSL certificate for main-gateway.local expires in 7 days',
          source: 'certificate_management',
          data: { certificateName: 'main-gateway.local', daysUntilExpiry: 7 },
        },
        certificate_expired: {
          type: 'certificate_expired',
          title: 'Certificate Expired',
          description: 'SSL certificate for api.sentinel.local has expired',
          source: 'certificate_management',
          data: { certificateName: 'api.sentinel.local', expiredDays: 2 },
        },
        secret_rotation_failed: {
          type: 'secret_rotation_failed',
          title: 'Secret Rotation Failed',
          description: 'Failed to rotate database credentials: connection timeout',
          source: 'secret_vault',
          data: { secretName: 'db-master-password', error: 'connection_timeout' },
        },
        tpm_attestation_failed: {
          type: 'tpm_attestation_failed',
          title: 'TPM Attestation Failed',
          description: 'Device DVR-01 failed TPM attestation check',
          source: 'tpm_attestation',
          data: { deviceId: 'DVR-01', reason: 'pcr_mismatch' },
        },
        zero_trust_high_risk: {
          type: 'zero_trust_high_risk',
          title: 'High Risk Access Attempt',
          description: 'Access denied for user with risk score 85',
          source: 'zero_trust',
          data: { userId: 'user-123', riskScore: 85, reason: 'unusual_location' },
        },
        security_score_low: {
          type: 'security_score_low',
          title: 'Security Score Below Threshold',
          description: 'Overall security score dropped to 65',
          source: 'security_posture',
          data: { currentScore: 65, threshold: 80, criticalIssues: 3 },
        },
        ransomware_detected: {
          type: 'ransomware_detected',
          title: 'Ransomware Activity Detected',
          description: 'Suspicious encryption activity detected on storage-01',
          source: 'ransomware_detection',
          data: { targetDevice: 'storage-01', filesAffected: 127 },
        },
        tamper_detected: {
          type: 'tamper_detected',
          title: 'Device Tampering Detected',
          description: 'Physical tampering detected on Camera-07',
          source: 'tamper_detection',
          data: { deviceId: 'Camera-07', sensorTriggered: 'motion_sensor' },
        },
      };

      const template = alertTemplates[body.alertType];
      
      const securityAlert = {
        id: alertId,
        type: template.type,
        severity: body.severity,
        title: template.title,
        description: template.description,
        source: template.source,
        data: template.data,
        timestamp: new Date(),
        acknowledged: false,
      };

      // Emit the alert through security monitor
      if (securityMonitor) {
        securityMonitor.emit('alert:created', securityAlert);
      }

      app.log.info({ alertId, type: body.alertType, severity: body.severity }, 'Test security alert generated');

      return {
        message: 'Test security alert generated',
        alert: securityAlert,
        note: 'This is a synthetic alert for testing purposes',
      };
    } catch (error) {
      app.log.error({ error, alertType: body.alertType }, 'Test alert generation failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'alert_generation_failed',
      });
    }
  });

  /**
   * GET /v1/security/test/sse-verify
   * Verify SSE connection is working
   */
  app.get('/v1/security/test/sse-verify', async (request, reply) => {
    return {
      message: 'SSE endpoint verification',
      sseEndpoint: '/v1/alerts/events',
      instructions: [
        '1. Open browser console',
        '2. Run: const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true })',
        '3. Add listener: events.addEventListener("alert.created", (e) => console.log(JSON.parse(e.data)))',
        '4. Generate test alert: POST /v1/alerts/command-center/demo',
        '5. Watch console for alert event',
      ],
      testCommand: 'curl -X POST /api/control/v1/alerts/command-center/demo -H "Content-Type: application/json" -d \'{"severity":"P1","detectionType":"camera-tampering"}\'',
    };
  });
}
