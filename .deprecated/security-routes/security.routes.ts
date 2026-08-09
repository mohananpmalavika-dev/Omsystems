/**
 * Security API Routes
 * Comprehensive RESTful API for all enterprise security features
 */

import { Router, Request, Response } from 'express';
import { zeroTrustService } from '../services/zero-trust.service';
import { certificateManager } from '../services/certificate-manager.service';
import { passwordRotationService } from '../services/password-rotation.service';
import { tamperDetectionService } from '../services/tamper-detection.service';
import { videoEncryptionService } from '../services/video-encryption.service';
import { immutableStorageService } from '../services/immutable-storage.service';
import { ransomwareDetectionService } from '../services/ransomware-detection.service';
import { supplyChainVerificationService } from '../services/supply-chain-verification.service';
import { secureBootTPMService } from '../services/secure-boot-tpm.service';
import { securityOperationsService } from '../services/security-operations.service';

const router = Router();

// ============================================================================
// Security Operations Center (SOC)
// ============================================================================

/**
 * @route GET /api/security/posture
 * @desc Get current security posture
 * @access Private
 */
router.get('/posture', async (req: Request, res: Response) => {
  try {
    const posture = await securityOperationsService.getSecurityPosture();
    res.json(posture);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/alerts
 * @desc Get active security alerts
 * @access Private
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await securityOperationsService.getActiveAlerts();
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/alerts/:id/acknowledge
 * @desc Acknowledge security alert
 * @access Private
 */
router.post('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const success = await securityOperationsService.acknowledgeAlert(req.params.id);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/alerts/:id/resolve
 * @desc Resolve security alert
 * @access Private
 */
router.post('/alerts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const success = await securityOperationsService.resolveAlert(req.params.id);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/health
 * @desc Run security health check
 * @access Private
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await securityOperationsService.runHealthCheck();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/report
 * @desc Get security report for date range
 * @access Private
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const report = await securityOperationsService.getSecurityReport(startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Zero Trust
// ============================================================================

/**
 * @route POST /api/security/zero-trust/evaluate
 * @desc Evaluate access request
 * @access Private
 */
router.post('/zero-trust/evaluate', async (req: Request, res: Response) => {
  try {
    const { context, resource, action } = req.body;
    const decision = await zeroTrustService.evaluateAccess(context, resource, action);
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/zero-trust/devices/register
 * @desc Register device for zero trust
 * @access Private
 */
router.post('/zero-trust/devices/register', async (req: Request, res: Response) => {
  try {
    const { deviceId, certificate, tpmAttestation, secureBootStatus } = req.body;
    const deviceTrust = await zeroTrustService.registerDevice(
      deviceId,
      certificate,
      tpmAttestation,
      secureBootStatus
    );
    res.json(deviceTrust);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/zero-trust/devices/:id
 * @desc Get device trust status
 * @access Private
 */
router.get('/zero-trust/devices/:id', async (req: Request, res: Response) => {
  try {
    const deviceTrust = await zeroTrustService.getDeviceTrust(req.params.id);
    res.json(deviceTrust);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/zero-trust/devices
 * @desc List all devices
 * @access Private
 */
router.get('/zero-trust/devices', async (req: Request, res: Response) => {
  try {
    const devices = await zeroTrustService.listDevices(req.query as any);
    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/zero-trust/metrics
 * @desc Get zero trust metrics
 * @access Private
 */
router.get('/zero-trust/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await zeroTrustService.getMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Certificate Management
// ============================================================================

/**
 * @route POST /api/security/certificates
 * @desc Add certificate to management
 * @access Private
 */
router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const { certPem, deviceId, deviceType, autoRenew } = req.body;
    const certificate = await certificateManager.addCertificate(certPem, deviceId, deviceType, autoRenew);
    res.json(certificate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/certificates
 * @desc List certificates
 * @access Private
 */
router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const certificates = await certificateManager.listCertificates(req.query as any);
    res.json(certificates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/certificates/:id
 * @desc Get certificate details
 * @access Private
 */
router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const certificate = await certificateManager.getCertificate(req.params.id);
    res.json(certificate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/certificates/health
 * @desc Get certificate health overview
 * @access Private
 */
router.get('/certificates/health', async (req: Request, res: Response) => {
  try {
    const health = await certificateManager.getHealth();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/certificates/:id/renew
 * @desc Renew certificate
 * @access Private
 */
router.post('/certificates/:id/renew', async (req: Request, res: Response) => {
  try {
    const certificate = await certificateManager.renewCertificate(req.params.id);
    res.json(certificate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/certificates/:id/revoke
 * @desc Revoke certificate
 * @access Private
 */
router.post('/certificates/:id/revoke', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const success = await certificateManager.revokeCertificate(req.params.id, reason);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Password Rotation
// ============================================================================

/**
 * @route POST /api/security/password-rotation/schedule
 * @desc Schedule password rotation
 * @access Private
 */
router.post('/password-rotation/schedule', async (req: Request, res: Response) => {
  try {
    const { targetType, targetId, targetName, scheduledAt } = req.body;
    const job = await passwordRotationService.scheduleRotation(
      targetType,
      targetId,
      targetName,
      scheduledAt ? new Date(scheduledAt) : undefined
    );
    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/password-rotation/:id/execute
 * @desc Execute password rotation
 * @access Private
 */
router.post('/password-rotation/:id/execute', async (req: Request, res: Response) => {
  try {
    const job = await passwordRotationService.executeRotation(req.params.id);
    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/password-rotation/jobs
 * @desc List rotation jobs
 * @access Private
 */
router.get('/password-rotation/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await passwordRotationService.listJobs(req.query as any);
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/password-rotation/statistics
 * @desc Get rotation statistics
 * @access Private
 */
router.get('/password-rotation/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await passwordRotationService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Tamper Detection
// ============================================================================

/**
 * @route POST /api/security/tamper/report
 * @desc Report tamper event
 * @access Private
 */
router.post('/tamper/report', async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceType, deviceName, tamperType, description, evidenceUrls } = req.body;
    const event = await tamperDetectionService.reportTamperEvent(
      deviceId,
      deviceType,
      deviceName,
      tamperType,
      description,
      evidenceUrls
    );
    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/tamper/events
 * @desc List tamper events
 * @access Private
 */
router.get('/tamper/events', async (req: Request, res: Response) => {
  try {
    const events = await tamperDetectionService.listEvents(req.query as any);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/tamper/events/:id
 * @desc Get tamper event details
 * @access Private
 */
router.get('/tamper/events/:id', async (req: Request, res: Response) => {
  try {
    const event = await tamperDetectionService.getEvent(req.params.id);
    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/tamper/events/:id/acknowledge
 * @desc Acknowledge tamper event
 * @access Private
 */
router.post('/tamper/events/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { acknowledgedBy } = req.body;
    const success = await tamperDetectionService.acknowledgeEvent(req.params.id, acknowledgedBy);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/tamper/statistics
 * @desc Get tamper detection statistics
 * @access Private
 */
router.get('/tamper/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await tamperDetectionService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Video Encryption
// ============================================================================

/**
 * @route POST /api/security/video-encryption/encrypt
 * @desc Encrypt video file
 * @access Private
 */
router.post('/video-encryption/encrypt', async (req: Request, res: Response) => {
  try {
    const { videoPath, outputPath } = req.body;
    const encryptedVideo = await videoEncryptionService.encryptVideo(videoPath, outputPath);
    res.json(encryptedVideo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/video-encryption/decrypt
 * @desc Decrypt video file
 * @access Private
 */
router.post('/video-encryption/decrypt', async (req: Request, res: Response) => {
  try {
    const { encryptedVideoId, outputPath } = req.body;
    const decryptedPath = await videoEncryptionService.decryptVideo(encryptedVideoId, outputPath);
    res.json({ decryptedPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/video-encryption/videos
 * @desc List encrypted videos
 * @access Private
 */
router.get('/video-encryption/videos', async (req: Request, res: Response) => {
  try {
    const videos = await videoEncryptionService.listEncryptedVideos();
    res.json(videos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Immutable Storage
// ============================================================================

/**
 * @route POST /api/security/immutable-storage/objects
 * @desc Create immutable object
 * @access Private
 */
router.post('/immutable-storage/objects', async (req: Request, res: Response) => {
  try {
    const { objectType, objectId, objectPath, retentionPolicy, metadata } = req.body;
    const object = await immutableStorageService.createImmutableObject(
      objectType,
      objectId,
      objectPath,
      retentionPolicy,
      metadata
    );
    res.json(object);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/immutable-storage/objects/:id/legal-hold
 * @desc Apply legal hold
 * @access Private
 */
router.post('/immutable-storage/objects/:id/legal-hold', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const success = await immutableStorageService.applyLegalHold(req.params.id, reason);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/immutable-storage/objects
 * @desc List immutable objects
 * @access Private
 */
router.get('/immutable-storage/objects', async (req: Request, res: Response) => {
  try {
    const objects = await immutableStorageService.listObjects(req.query as any);
    res.json(objects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/immutable-storage/statistics
 * @desc Get immutable storage statistics
 * @access Private
 */
router.get('/immutable-storage/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await immutableStorageService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Ransomware Detection
// ============================================================================

/**
 * @route POST /api/security/ransomware/report
 * @desc Report ransomware event
 * @access Private
 */
router.post('/ransomware/report', async (req: Request, res: Response) => {
  try {
    const { affectedDevices, indicators } = req.body;
    const event = await ransomwareDetectionService.reportRansomwareEvent(affectedDevices, indicators);
    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/ransomware/events
 * @desc List ransomware events
 * @access Private
 */
router.get('/ransomware/events', async (req: Request, res: Response) => {
  try {
    const events = await ransomwareDetectionService.listEvents(req.query as any);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/ransomware/statistics
 * @desc Get ransomware detection statistics
 * @access Private
 */
router.get('/ransomware/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await ransomwareDetectionService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Supply Chain Verification
// ============================================================================

/**
 * @route POST /api/security/supply-chain/verify
 * @desc Verify software package
 * @access Private
 */
router.post('/supply-chain/verify', async (req: Request, res: Response) => {
  try {
    const { name, version, vendor, downloadUrl, filePath } = req.body;
    const pkg = await supplyChainVerificationService.verifyPackage(
      name,
      version,
      vendor,
      downloadUrl,
      filePath
    );
    res.json(pkg);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/supply-chain/packages
 * @desc List verified packages
 * @access Private
 */
router.get('/supply-chain/packages', async (req: Request, res: Response) => {
  try {
    const packages = await supplyChainVerificationService.listPackages(req.query as any);
    res.json(packages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/supply-chain/statistics
 * @desc Get supply chain statistics
 * @access Private
 */
router.get('/supply-chain/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await supplyChainVerificationService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Secure Boot & TPM
// ============================================================================

/**
 * @route POST /api/security/secure-boot/verify
 * @desc Verify secure boot chain
 * @access Private
 */
router.post('/secure-boot/verify', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    const status = await secureBootTPMService.verifySecureBoot(deviceId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/tpm/register
 * @desc Register TPM device
 * @access Private
 */
router.post('/tpm/register', async (req: Request, res: Response) => {
  try {
    const { deviceId, tpmVersion, manufacturer, firmwareVersion, ekCertificate } = req.body;
    const tpmDevice = await secureBootTPMService.registerTPMDevice(
      deviceId,
      tpmVersion,
      manufacturer,
      firmwareVersion,
      ekCertificate
    );
    res.json(tpmDevice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/security/tpm/attest
 * @desc Perform TPM attestation
 * @access Private
 */
router.post('/tpm/attest', async (req: Request, res: Response) => {
  try {
    const { deviceId, quote, signature } = req.body;
    const result = await secureBootTPMService.attestTPM(deviceId, quote, signature);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/tpm/devices
 * @desc List TPM devices
 * @access Private
 */
router.get('/tpm/devices', async (req: Request, res: Response) => {
  try {
    const devices = await secureBootTPMService.listTPMDevices(req.query as any);
    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/security/secure-boot/statistics
 * @desc Get secure boot and TPM statistics
 * @access Private
 */
router.get('/secure-boot/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await secureBootTPMService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
