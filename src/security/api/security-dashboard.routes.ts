/**
 * Security Dashboard API Routes
 * Comprehensive REST APIs for all security services
 */

import { Router, Request, Response } from 'express';
import { SecurityServicesFactory } from '../services/index.js';
import { SecretType, CertificateType, ComplianceFramework } from '../types.js';

const router = Router();
const securityServices = SecurityServicesFactory.getInstance();

// ============================================================================
// Security Posture APIs
// ============================================================================

/**
 * GET /v1/security/posture
 * Get overall security posture
 */
router.get('/posture', async (req: Request, res: Response) => {
  try {
    const posture = await securityServices.zeroTrust?.calculatePosture
      ? await (securityServices as any).securityPosture.getPosture()
      : { overallScore: 0, message: 'Security posture service not initialized' };
    res.json(posture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/posture/calculate
 * Recalculate security posture
 */
router.post('/posture/calculate', async (req: Request, res: Response) => {
  try {
    const posture = await (securityServices as any).securityPosture.calculatePosture();
    res.json(posture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/posture/history
 * Get security posture history
 */
router.get('/posture/history', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const history = await (securityServices as any).securityPosture.getPostureHistory(days);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/issues
 * List security issues
 */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const filters = {
      category: req.query.category as string,
      severity: req.query.severity as string,
      resolved: req.query.resolved === 'true'
    };
    const issues = await (securityServices as any).securityPosture.listIssues(filters);
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/issues/:id/resolve
 * Resolve security issue
 */
router.post('/issues/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    await (securityServices as any).securityPosture.resolveIssue(id, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Certificate Management APIs
// ============================================================================

/**
 * GET /v1/security/certificates
 * List certificates
 */
router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as CertificateType,
      status: req.query.status as string,
      expiringSoon: req.query.expiringSoon === 'true'
    };
    const certificates = await securityServices.certificateManagement.listCertificates(filters);
    res.json(certificates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/certificates
 * Import certificate
 */
router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const { name, type, pemCertificate, pemPrivateKey, pemChain } = req.body;
    const certificate = await securityServices.certificateManagement.importCertificate(
      name,
      type,
      pemCertificate,
      pemPrivateKey,
      pemChain
    );
    res.status(201).json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/certificates/:id
 * Get certificate
 */
router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const certificate = await securityServices.certificateManagement.getCertificate(req.params.id);
    res.json(certificate);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /v1/security/certificates/:id/verify
 * Verify certificate
 */
router.post('/certificates/:id/verify', async (req: Request, res: Response) => {
  try {
    const check = await securityServices.certificateManagement.verifyCertificate(req.params.id);
    res.json(check);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/certificates/:id/renew
 * Renew certificate
 */
router.post('/certificates/:id/renew', async (req: Request, res: Response) => {
  try {
    const certificate = await securityServices.certificateManagement.renewCertificate(req.params.id);
    res.json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v1/security/certificates/:id
 * Delete certificate
 */
router.delete('/certificates/:id', async (req: Request, res: Response) => {
  try {
    await securityServices.certificateManagement.deleteCertificate(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Secret Vault APIs
// ============================================================================

/**
 * GET /v1/security/secrets
 * List secrets
 */
router.get('/secrets', async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as SecretType,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      expiringSoon: req.query.expiringSoon === 'true',
      needsRotation: req.query.needsRotation === 'true'
    };
    const secrets = await securityServices.secretVault.listSecrets(filters);
    
    // Remove sensitive values from response
    const sanitized = secrets.map(s => ({ ...s, value: '[REDACTED]' }));
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/secrets
 * Create secret
 */
router.post('/secrets', async (req: Request, res: Response) => {
  try {
    const { name, type, value, metadata } = req.body;
    const secret = await securityServices.secretVault.createSecret(name, type, value, metadata);
    res.status(201).json({ ...secret, value: '[REDACTED]' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/secrets/:id
 * Get secret (requires authentication)
 */
router.get('/secrets/:id', async (req: Request, res: Response) => {
  try {
    const secret = await securityServices.secretVault.getSecret(req.params.id);
    const decrypted = await securityServices.secretVault.decrypt(secret.value);
    res.json({ ...secret, value: decrypted });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * PUT /v1/security/secrets/:id
 * Update secret
 */
router.put('/secrets/:id', async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const secret = await securityServices.secretVault.updateSecret(req.params.id, value);
    res.json({ ...secret, value: '[REDACTED]' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/secrets/:id/rotate
 * Rotate secret
 */
router.post('/secrets/:id/rotate', async (req: Request, res: Response) => {
  try {
    const secret = await securityServices.secretVault.rotateSecret(req.params.id);
    res.json({ ...secret, value: '[REDACTED]' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v1/security/secrets/:id
 * Delete secret
 */
router.delete('/secrets/:id', async (req: Request, res: Response) => {
  try {
    await securityServices.secretVault.deleteSecret(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Password Rotation APIs
// ============================================================================

/**
 * GET /v1/security/password-rotation
 * List rotation targets
 */
router.get('/password-rotation', async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as string,
      enabled: req.query.enabled === 'true',
      needsRotation: req.query.needsRotation === 'true',
      overdue: req.query.overdue === 'true'
    };
    const targets = await securityServices.passwordRotation.listTargets(filters);
    res.json(targets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/password-rotation
 * Add rotation target
 */
router.post('/password-rotation', async (req: Request, res: Response) => {
  try {
    const target = await securityServices.passwordRotation.addTarget(req.body);
    res.status(201).json(target);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/rotate-password
 * Rotate password for target
 */
router.post('/rotate-password', async (req: Request, res: Response) => {
  try {
    const { targetId, force } = req.body;
    const job = await securityServices.passwordRotation.rotatePassword(targetId, force);
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/password-rotation/jobs
 * List rotation jobs
 */
router.get('/password-rotation/jobs', async (req: Request, res: Response) => {
  try {
    const { targetId, status } = req.query;
    const jobs = await securityServices.passwordRotation.listJobs(
      targetId as string,
      status as string
    );
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Tamper Detection APIs
// ============================================================================

/**
 * GET /v1/security/tamper-events
 * List tamper events
 */
router.get('/tamper-events', async (req: Request, res: Response) => {
  try {
    const filters = {
      deviceType: req.query.deviceType as string,
      type: req.query.type as any,
      severity: req.query.severity as string,
      acknowledged: req.query.acknowledged === 'true'
    };
    const events = await (securityServices as any).tamperDetection.listTamperEvents(filters);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/tamper-events/:id/acknowledge
 * Acknowledge tamper event
 */
router.post('/tamper-events/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { userId, resolution } = req.body;
    await (securityServices as any).tamperDetection.acknowledgeTamperEvent(
      req.params.id,
      userId,
      resolution
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Zero Trust APIs
// ============================================================================

/**
 * POST /v1/security/zero-trust/evaluate
 * Evaluate access request
 */
router.post('/zero-trust/evaluate', async (req: Request, res: Response) => {
  try {
    const response = await securityServices.zeroTrust.evaluateAccess(req.body);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/zero-trust/policies
 * List Zero Trust policies
 */
router.get('/zero-trust/policies', async (req: Request, res: Response) => {
  try {
    const enabled = req.query.enabled === 'true' ? true : undefined;
    const policies = await securityServices.zeroTrust.listPolicies(enabled);
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/zero-trust/policies
 * Create Zero Trust policy
 */
router.post('/zero-trust/policies', async (req: Request, res: Response) => {
  try {
    const policy = await securityServices.zeroTrust.createPolicy(req.body);
    res.status(201).json(policy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Ransomware Detection APIs
// ============================================================================

/**
 * GET /v1/security/threats
 * List ransomware threats
 */
router.get('/threats', async (req: Request, res: Response) => {
  try {
    const filters = {
      deviceId: req.query.deviceId as string,
      level: req.query.level as string,
      resolved: req.query.resolved === 'true'
    };
    const threats = await (securityServices as any).ransomwareDetection.listThreats(filters);
    res.json(threats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/threats/:id/resolve
 * Resolve threat
 */
router.post('/threats/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { userId, notes } = req.body;
    await (securityServices as any).ransomwareDetection.resolveThreat(req.params.id, userId, notes);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/devices/:id/isolate
 * Isolate device
 */
router.post('/devices/:id/isolate', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await (securityServices as any).ransomwareDetection.isolateDevice(req.params.id, reason);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Immutable Storage APIs
// ============================================================================

/**
 * GET /v1/security/immutable-storage
 * List immutable objects
 */
router.get('/immutable-storage', async (req: Request, res: Response) => {
  try {
    const filters = {
      objectType: req.query.objectType as string,
      retentionStatus: req.query.retentionStatus as string,
      hasLegalHold: req.query.hasLegalHold === 'true'
    };
    const objects = await (securityServices as any).immutableStorage.listImmutableObjects(filters);
    res.json(objects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/immutable-storage/:id/legal-hold
 * Apply legal hold
 */
router.post('/immutable-storage/:id/legal-hold', async (req: Request, res: Response) => {
  try {
    const { caseNumber, description } = req.body;
    await (securityServices as any).immutableStorage.applyLegalHold(
      req.params.id,
      caseNumber,
      description
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Supply Chain Verification APIs
// ============================================================================

/**
 * POST /v1/security/verify-package
 * Verify software package
 */
router.post('/verify-package', async (req: Request, res: Response) => {
  try {
    const { packagePath } = req.body;
    const pkg = await (securityServices as any).supplyChain.verifyPackage(packagePath);
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/packages
 * List software packages
 */
router.get('/packages', async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as string,
      vendor: req.query.vendor as string,
      verificationStatus: req.query.verificationStatus as string
    };
    const packages = await (securityServices as any).supplyChain.listPackages(filters);
    res.json(packages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Secure Boot APIs
// ============================================================================

/**
 * GET /v1/security/secure-boot
 * List secure boot status
 */
router.get('/secure-boot', async (req: Request, res: Response) => {
  try {
    const statuses = await (securityServices as any).secureBoot.listDeviceBootStatus();
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/secure-boot/:deviceId/verify
 * Verify device boot
 */
router.post('/secure-boot/:deviceId/verify', async (req: Request, res: Response) => {
  try {
    const status = await (securityServices as any).secureBoot.verifyBoot(req.params.deviceId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TPM APIs
// ============================================================================

/**
 * GET /v1/security/tpm
 * List TPM devices
 */
router.get('/tpm', async (req: Request, res: Response) => {
  try {
    const devices = await (securityServices as any).tpm.listTPMDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/security/attest-device
 * Request device attestation
 */
router.post('/attest-device', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    const result = await (securityServices as any).tpm.requestAttestation(deviceId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Compliance APIs
// ============================================================================

/**
 * GET /v1/security/compliance
 * List compliance frameworks
 */
router.get('/compliance', async (req: Request, res: Response) => {
  try {
    const frameworks = await (securityServices as any).securityPosture.listComplianceFrameworks();
    res.json(frameworks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/security/compliance/:framework
 * Assess compliance for framework
 */
router.get('/compliance/:framework', async (req: Request, res: Response) => {
  try {
    const status = await (securityServices as any).securityPosture.assessCompliance(
      req.params.framework as ComplianceFramework
    );
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /v1/security/health
 * Health check for all security services
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await securityServices.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
