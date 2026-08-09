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

      // Enrich posture with explicit provenance for collectors that are unavailable
      const enrichedPosture: any = { ...posture };

      // If secret vault not configured, mark secrets metrics as UNAVAILABLE
      if (!securityServices.secretVault) {
        enrichedPosture.secrets = {
          status: 'UNAVAILABLE',
          rotationCompliance: null,
          expiring: null,
          note: 'Secret vault collector not configured',
        };
      }

      // If certificate management / TLS telemetry not configured, mark encryption metrics unavailable
      if (!securityServices.certificateManagement) {
        enrichedPosture.encryption = {
          score: null,
          videosEncrypted: null,
          videosTotal: null,
          tlsCompliance: null,
          note: 'Certificate/TLS collector not configured',
        };
      }

      // If posture lacks event metrics, make explicit unavailable markers
      if (typeof enrichedPosture.eventsToday === 'undefined' || enrichedPosture.eventsToday === 0) {
        // only mark unavailable when collector likely absent (heuristic)
        enrichedPosture.eventsToday = null;
      }

      if (typeof enrichedPosture.resolvedToday === 'undefined' || enrichedPosture.resolvedToday === 0) {
        enrichedPosture.resolvedToday = null;
      }

      return {
        available: true,
        provenance: 'LIVE',
        ...enrichedPosture,
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
  // Secret Vault APIs (Secure with Authorization & Audit)
  // ============================================================================

  /**
   * GET /v1/security/secrets
   * List secrets (metadata only, values redacted)
   */
  app.get('/v1/security/secrets', async (request, reply) => {
    const query = z.object({
      type: z.string().optional(),
      tags: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      const filters: any = {};
      if (query.type) filters.type = query.type;
      if (query.tags) filters.tags = query.tags.split(',');

      const secrets = await secretVault.listSecrets(filters);
      
      // IMPORTANT: Redact secret values - never expose in list
      const sanitized = secrets.map(s => ({
        ...s,
        value: '[REDACTED]',
      }));

      return { 
        data: sanitized,
        count: sanitized.length,
        note: 'Secret values are redacted. Use GET /v1/security/secrets/:id to decrypt specific secrets.',
      };
    } catch (error) {
      app.log.error({ error }, 'Secret listing failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_listing_failed',
      });
    }
  });

  /**
   * GET /v1/security/secrets/:secretId
   * Get secret with decrypted value (SECURE ENDPOINT)
   * 
   * Security controls:
   * - Authentication required
   * - Authorization check (owner, ACL, or admin)
   * - Rate limiting (50 reads/hour per user)
   * - Full audit logging
   * - Optional justification
   */
  app.get('/v1/security/secrets/:secretId', async (request, reply) => {
    const params = z.object({
      secretId: z.string(),
    }).parse(request.params);

    // Accept optional reveal query + justification (reveal requires stronger checks)
    const query = z.object({ reveal: z.coerce.boolean().optional().default(false), justification: z.string().optional() }).parse(request.query as any);

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      // SECURITY: Import and apply access control middleware
      const { requireSecretAccess, completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      
      // Check authorization, rate limit, and audit (reads are audited)
      const allowed = await requireSecretAccess(request, reply, 'read');
      if (!allowed) {
        return; // Response already sent by middleware
      }

      // Access granted - retrieve secret metadata
      const secret = await secretVault.getSecret(params.secretId);
      
      if (!secret) {
        await completeSecretAccessAudit(request, false, 'secret_not_found');
        return reply.code(404).send({ error: 'secret_not_found' });
      }

      // By default DO NOT return plaintext. Only reveal when explicitly requested and permitted.
      const revealRequested = Boolean(query.reveal);

      // Determine decision stored by middleware (reason, requiresApproval, etc.)
      const decision = (request as any).secretAccessDecision as { allowed: boolean; reason?: string; requiresApproval?: boolean } | undefined;
      const context = (request as any).secretAccessContext as { userId?: string } | undefined;

      // Helper to mask secret values (show type and small suffix/prefix for identification)
      function maskValue(val: string | undefined) {
        if (!val) return undefined;
        if (val.length <= 6) return '******';
        return `${val.slice(0, 2)}******${val.slice(-2)}`;
      }

      if (!revealRequested) {
        // Return metadata only with masked value
        await completeSecretAccessAudit(request, true);
        return {
          ...secret,
          value: maskValue((secret as any).value),
          note: 'Secret value redacted. To retrieve plaintext, request with ?reveal=true and provide a justification. Plaintext retrieval is restricted and audited.',
        };
      }

      // Reveal requested: require stronger justification and role check
      const justification = (query.justification || (request as any).body?.justification) as string | undefined;

      // Only allow reveal for admin/owner/explicit access reasons
      const allowedReasons = ['admin', 'owner', 'explicit_access', 'role_access'];
      const reason = decision?.reason ?? '';

      if (!decision?.allowed || !allowedReasons.some((r) => reason.includes(r))) {
        // Not allowed to reveal even though read metadata was allowed
        await completeSecretAccessAudit(request, false, 'reveal_not_permitted');
        return reply.code(403).send({ error: 'reveal_not_permitted', message: 'You are not authorized to retrieve plaintext for this secret' });
      }

      if (!justification || justification.trim().length < 10) {
        await completeSecretAccessAudit(request, false, 'justification_required');
        return reply.code(400).send({ error: 'justification_required', message: 'Provide a justification (min 10 chars) to retrieve plaintext' });
      }

      // Attach justification into context for auditing
      if (context) context.justification = justification;

      // Decrypt the secret value (sensitive operation)
      const decryptedValue = await secretVault.decrypt(secret.value);

      // Complete audit log with success
      await completeSecretAccessAudit(request, true);

      return {
        id: (secret as any).id,
        name: (secret as any).name,
        type: (secret as any).type,
        tags: (secret as any).tags,
        metadata: (secret as any).metadata,
        value: decryptedValue,
        accessedBy: (request as any).currentUser?.id,
        accessedAt: new Date().toISOString(),
        warning: 'PLAINTEXT_SECRET — handle with extreme care. Do not log or store in insecure locations.',
      };
    } catch (error) {
      app.log.error({ error, secretId: params.secretId }, 'Secret retrieval failed');
      
      // Audit the failure
      const { completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      await completeSecretAccessAudit(request, false, error instanceof Error ? error.message : 'unknown_error');
      
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_retrieval_failed',
      });
    }
  });

  /**
   * POST /v1/security/secrets
   * Create new secret
   */
  app.post('/v1/security/secrets', async (request, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['password', 'api_key', 'token', 'certificate', 'private_key', 'database_credential', 'ssh_key', 'encryption_key', 'signing_key']),
      value: z.string().min(1),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
      expiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      const user = (request as any).currentUser;
      if (!user) {
        return reply.code(401).send({ error: 'authentication_required' });
      }

      // Create secret
      const secret = await secretVault.createSecret(
        body.name,
        body.type as any,
        body.value,
        {
          ...body.metadata,
          createdBy: user.id,
          description: body.description,
          tags: body.tags,
        }
      );

      // Audit the creation
      await store.writeAudit({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'secret.created',
        resourceNodeId: null,
        outcome: 'success',
        details: { secretId: secret.id, secretName: secret.name, type: body.type },
      });

      app.log.info({ secretId: secret.id, userId: user.id }, 'Secret created');

      return {
        ...secret,
        value: '[REDACTED]',
        message: 'Secret created successfully',
      };
    } catch (error) {
      app.log.error({ error }, 'Secret creation failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_creation_failed',
      });
    }
  });

  /**
   * PUT /v1/security/secrets/:secretId
   * Update secret value (requires authorization)
   */
  app.put('/v1/security/secrets/:secretId', async (request, reply) => {
    const params = z.object({
      secretId: z.string(),
    }).parse(request.params);

    const body = z.object({
      value: z.string().min(1),
      justification: z.string().optional(),
    }).parse(request.body);

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      // SECURITY: Check authorization
      const { requireSecretAccess, completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      
      const allowed = await requireSecretAccess(request, reply, 'write');
      if (!allowed) {
        return;
      }

      // Update secret
      const secret = await secretVault.updateSecret(params.secretId, body.value);
      
      // Complete audit
      await completeSecretAccessAudit(request, true);

      app.log.info({ secretId: params.secretId }, 'Secret updated');

      return {
        ...secret,
        value: '[REDACTED]',
        message: 'Secret updated successfully',
      };
    } catch (error) {
      app.log.error({ error, secretId: params.secretId }, 'Secret update failed');
      
      const { completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      await completeSecretAccessAudit(request, false, error instanceof Error ? error.message : 'unknown_error');
      
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_update_failed',
      });
    }
  });

  /**
   * POST /v1/security/secrets/:secretId/rotate
   * Rotate secret (generates new value)
   */
  app.post('/v1/security/secrets/:secretId/rotate', async (request, reply) => {
    const params = z.object({
      secretId: z.string(),
    }).parse(request.params);

    const body = z.object({
      justification: z.string().optional(),
    }).parse(request.body || {});

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      // SECURITY: Check authorization
      const { requireSecretAccess, completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      
      const allowed = await requireSecretAccess(request, reply, 'rotate');
      if (!allowed) {
        return;
      }

      // Rotate secret
      const secret = await secretVault.rotateSecret(params.secretId);
      
      // Complete audit
      await completeSecretAccessAudit(request, true);

      app.log.info({ secretId: params.secretId }, 'Secret rotated');

      return {
        ...secret,
        value: '[REDACTED]',
        message: 'Secret rotated successfully',
        rotatedAt: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, secretId: params.secretId }, 'Secret rotation failed');
      
      const { completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      await completeSecretAccessAudit(request, false, error instanceof Error ? error.message : 'unknown_error');
      
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_rotation_failed',
      });
    }
  });

  /**
   * DELETE /v1/security/secrets/:secretId
   * Delete secret (admin only)
   */
  app.delete('/v1/security/secrets/:secretId', async (request, reply) => {
    const params = z.object({
      secretId: z.string(),
    }).parse(request.params);

    try {
      const secretVault = securityServices.secretVault;
      
      if (!secretVault) {
        return reply.code(503).send({
          error: 'secret_vault_not_initialized',
        });
      }

      // SECURITY: Check authorization (admin only for delete)
      const { requireSecretAccess, completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      
      const allowed = await requireSecretAccess(request, reply, 'delete');
      if (!allowed) {
        return;
      }

      // Delete secret
      await secretVault.deleteSecret(params.secretId);
      
      // Complete audit
      await completeSecretAccessAudit(request, true);

      app.log.info({ secretId: params.secretId }, 'Secret deleted');

      return {
        message: 'Secret deleted successfully',
        secretId: params.secretId,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, secretId: params.secretId }, 'Secret deletion failed');
      
      const { completeSecretAccessAudit } = await import('../security/middleware/secret-access-control.js');
      await completeSecretAccessAudit(request, false, error instanceof Error ? error.message : 'unknown_error');
      
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'secret_deletion_failed',
      });
    }
  });

  /**
   * GET /v1/security/secrets/:secretId/audit
   * Get audit trail for a secret
   */
  app.get('/v1/security/secrets/:secretId/audit', async (request, reply) => {
    const params = z.object({
      secretId: z.string(),
    }).parse(request.params);

    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.code(401).send({ error: 'authentication_required' });
      }

      // Only admins or secret owners can view audit trail
      const isAdmin = ['admin', 'super_admin'].includes(user.role);
      
      if (!isAdmin) {
        // Check if user owns the secret
        const secretVault = securityServices.secretVault;
        if (!secretVault) {
          return reply.code(503).send({ error: 'secret_vault_not_initialized' });
        }
        
        const secret = await secretVault.getSecret(params.secretId);
        if (!secret || secret.metadata?.createdBy !== user.id) {
          return reply.code(403).send({ error: 'access_denied' });
        }
      }

      const { getSecretAuditTrail } = await import('../security/middleware/secret-access-control.js');
      const auditTrail = await getSecretAuditTrail(params.secretId, query.limit);

      return {
        secretId: params.secretId,
        auditTrail,
        count: auditTrail.length,
      };
    } catch (error) {
      app.log.error({ error, secretId: params.secretId }, 'Audit trail retrieval failed');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'audit_trail_retrieval_failed',
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
