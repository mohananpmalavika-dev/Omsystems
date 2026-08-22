/**
 * Security Devices API Routes
 * REST endpoints for unified security device management
 */

import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { SecurityDeviceService } from '../services/security-device.service';
import { SecurityDeviceDiscoveryService } from '../services/security-device-discovery.service';
import { SecurityDeviceCorrelationService } from '../services/security-device-correlation.service';
import { PanicButtonEmergencyService } from '../services/panic-button-emergency.service';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

const router = Router();

// Initialize services (these will be injected from app.ts)
let deviceService: SecurityDeviceService;
let discoveryService: SecurityDeviceDiscoveryService;
let correlationService: SecurityDeviceCorrelationService;
let panicService: PanicButtonEmergencyService;

export function initializeSecurityDeviceRoutes(pool: Pool, redis: Redis) {
  deviceService = SecurityDeviceService.getInstance();
  discoveryService = SecurityDeviceDiscoveryService.getInstance();
  correlationService = new SecurityDeviceCorrelationService(pool, redis);
  panicService = PanicButtonEmergencyService.getInstance(pool, redis);
}

// ==================== Device Management ====================

/**
 * List all security devices with filtering
 * GET /api/v1/security-devices
 * Query params: branchId, deviceType, status, hasActiveAlarm, includeHealth
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.branchId) filters.branchId = req.query.branchId as string;
    if (req.query.deviceType) filters.deviceType = req.query.deviceType as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.hasActiveAlarm === 'true') filters.hasActiveAlarm = true;
    if (req.query.includeHealth === 'true') filters.includeHealth = true;

    const devices = await deviceService.getAllDevices(filters);
    
    res.json({
      success: true,
      data: devices,
      count: devices.length,
    });
  } catch (error) {
    console.error('Error listing security devices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list devices',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get device overview statistics
 * GET /api/v1/security-devices/overview
 */
router.get('/overview', authenticate, async (req: Request, res: Response) => {
  try {
    const allDevices = await deviceService.getAllDevices({ includeHealth: true });

    // Calculate statistics
    const stats = {
      totalDevices: allDevices.length,
      onlineDevices: allDevices.filter(d => d.health?.status === 'online').length,
      offlineDevices: allDevices.filter(d => d.health?.status === 'offline').length,
      degradedDevices: allDevices.filter(d => d.health?.status === 'degraded').length,
      alarmDevices: allDevices.filter(d => d.health?.hasActiveAlarm).length,
      branches: new Set(allDevices.map(d => d.branchId)).size,
    };

    // Device type breakdown
    const deviceTypeMap = new Map<string, { count: number; online: number; offline: number }>();
    
    allDevices.forEach(device => {
      const typeKey = device.deviceType;
      const existing = deviceTypeMap.get(typeKey) || { count: 0, online: 0, offline: 0 };
      
      existing.count++;
      if (device.health?.status === 'online') existing.online++;
      if (device.health?.status === 'offline') existing.offline++;
      
      deviceTypeMap.set(typeKey, existing);
    });

    const breakdown = Array.from(deviceTypeMap.entries()).map(([type, data]) => ({
      deviceType: type,
      ...data,
    }));

    res.json({
      success: true,
      data: {
        stats,
        breakdown,
      },
    });
  } catch (error) {
    console.error('Error getting device overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get device by ID
 * GET /api/v1/security-devices/:deviceId
 */
// Keep reserved collection routes such as /incidents and /postures reachable.
// Enrolled device identifiers are UUIDs in the security device schema.
router.get('/:deviceId([0-9a-fA-F-]{36})', authenticate, async (req: Request, res: Response) => {
  try {
    const device = await deviceService.getDeviceById(req.params.deviceId);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    res.json({
      success: true,
      data: device,
    });
  } catch (error) {
    console.error('Error getting device:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get device health history
 * GET /api/v1/security-devices/:deviceId/health
 * Query params: hours (default: 24)
 */
router.get('/:deviceId/health', authenticate, async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const history = await deviceService.getDeviceHealthHistory(req.params.deviceId, hours);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    console.error('Error getting device health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get device events
 * GET /api/v1/security-devices/:deviceId/events
 * Query params: eventType, severity, from, to, limit (default: 100)
 */
router.get('/:deviceId/events', authenticate, async (req: Request, res: Response) => {
  try {
    const filters: any = {
      deviceId: req.params.deviceId,
    };

    if (req.query.eventType) filters.eventType = req.query.eventType as string;
    if (req.query.severity) filters.severity = req.query.severity as string;
    if (req.query.from) filters.from = new Date(req.query.from as string);
    if (req.query.to) filters.to = new Date(req.query.to as string);

    const limit = parseInt(req.query.limit as string) || 100;
    const events = await deviceService.getDeviceEvents(filters, limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    console.error('Error getting device events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Execute device command
 * POST /api/v1/security-devices/:deviceId/command
 * Body: { command, parameters?, reason?, mfaToken? }
 */
router.post(
  '/:deviceId/command',
  authenticate,
  requirePermission('device:control'),
  async (req: Request, res: Response) => {
    try {
      const { command, parameters, reason, mfaToken } = req.body;

      if (!command) {
        return res.status(400).json({
          success: false,
          error: 'Command is required',
        });
      }

      const result = await deviceService.executeCommand(
        req.params.deviceId,
        command,
        req.user.id,
        parameters,
        reason,
        mfaToken
      );

      // Check if approval is required
      if (result.status === 'PENDING_APPROVAL') {
        return res.status(202).json({
          success: true,
          message: 'Command submitted for approval',
          data: result,
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error executing command:', error);
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      // MFA required
      if (message.includes('mfa_required') || message.includes('MFA')) {
        return res.status(403).json({
          success: false,
          error: 'mfa_required',
          message: 'MFA token required for this command',
        });
      }

      // Unauthorized
      if (message.includes('unauthorized') || message.includes('permission')) {
        return res.status(403).json({
          success: false,
          error: 'unauthorized',
          message: 'Insufficient permissions for this command',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Command execution failed',
        message,
      });
    }
  }
);

/**
 * Approve pending command
 * POST /api/v1/security-devices/:deviceId/command/:commandId/approve
 * Body: { mfaToken? }
 */
router.post(
  '/:deviceId/command/:commandId/approve',
  authenticate,
  requirePermission('device:control:approve'),
  async (req: Request, res: Response) => {
    try {
      const { mfaToken } = req.body;

      const result = await deviceService.approveCommand(
        req.params.commandId,
        req.user.id,
        mfaToken
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error approving command:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve command',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ==================== Discovery ====================

/**
 * List discovery jobs
 * GET /api/v1/security-devices/discovery/jobs
 * Query params: status
 */
router.get('/discovery/jobs', authenticate, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const jobs = await discoveryService.listDiscoveryJobs(status);

    res.json({
      success: true,
      data: jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error('Error listing discovery jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list discovery jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Start discovery job
 * POST /api/v1/security-devices/discovery/jobs
 * Body: { branchId, networkRanges, protocols }
 */
router.post(
  '/discovery/jobs',
  authenticate,
  requirePermission('device:discovery'),
  async (req: Request, res: Response) => {
    try {
      const { branchId, networkRanges, protocols } = req.body;

      if (!branchId || !networkRanges) {
        return res.status(400).json({
          success: false,
          error: 'branchId and networkRanges are required',
        });
      }

      const job = await discoveryService.startDiscovery(
        branchId,
        networkRanges,
        protocols,
        req.user.id
      );

      res.status(201).json({
        success: true,
        data: job,
      });
    } catch (error) {
      console.error('Error starting discovery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start discovery',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Get discovery job
 * GET /api/v1/security-devices/discovery/jobs/:jobId
 */
router.get('/discovery/jobs/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const job = await discoveryService.getDiscoveryJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Discovery job not found',
      });
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error getting discovery job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get discovery job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * List discovered devices
 * GET /api/v1/security-devices/discovery/devices
 * Query params: jobId, status
 */
router.get('/discovery/devices', authenticate, async (req: Request, res: Response) => {
  try {
    const jobId = req.query.jobId as string | undefined;
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;

    const devices = await discoveryService.listDiscoveredDevices(jobId, status);

    res.json({
      success: true,
      data: devices,
      count: devices.length,
    });
  } catch (error) {
    console.error('Error listing discovered devices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list discovered devices',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Approve discovered device
 * POST /api/v1/security-devices/discovery/devices/:deviceId/approve
 */
router.post(
  '/discovery/devices/:deviceId/approve',
  authenticate,
  requirePermission('device:discovery:approve'),
  async (req: Request, res: Response) => {
    try {
      await discoveryService.approveDiscoveredDevice(req.params.deviceId, req.user.id);

      res.json({
        success: true,
        message: 'Device approved and enrolled',
      });
    } catch (error) {
      console.error('Error approving device:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve device',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Reject discovered device
 * POST /api/v1/security-devices/discovery/devices/:deviceId/reject
 */
router.post(
  '/discovery/devices/:deviceId/reject',
  authenticate,
  requirePermission('device:discovery:approve'),
  async (req: Request, res: Response) => {
    try {
      await discoveryService.rejectDiscoveredDevice(req.params.deviceId);

      res.json({
        success: true,
        message: 'Device rejected',
      });
    } catch (error) {
      console.error('Error rejecting device:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reject device',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ==================== Branch Security Posture ====================

/**
 * Get branch security posture
 * GET /api/v1/security-devices/branches/:branchId/posture
 */
router.get('/branches/:branchId/posture', authenticate, async (req: Request, res: Response) => {
  try {
    const posture = await deviceService.getBranchSecurityPosture(req.params.branchId);

    if (!posture) {
      return res.status(404).json({
        success: false,
        error: 'Branch security posture not found',
      });
    }

    res.json({
      success: true,
      data: posture,
    });
  } catch (error) {
    console.error('Error getting branch posture:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get branch posture',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get all branch postures
 * GET /api/v1/security-devices/postures
 */
router.get('/postures', authenticate, async (req: Request, res: Response) => {
  try {
    // Get all branches and their postures
    // TODO: Implement pagination for large deployments
    const postures = await deviceService.getAllBranchPostures();

    res.json({
      success: true,
      data: postures,
      count: postures.length,
    });
  } catch (error) {
    console.error('Error getting branch postures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get branch postures',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== Correlated Incidents ====================

/**
 * Get correlated security incidents
 * GET /api/v1/security-devices/incidents
 * Query params: branchId, status, severity, from, to
 */
router.get('/incidents', authenticate, async (req: Request, res: Response) => {
  try {
    const filters: any = {};

    if (req.query.branchId) filters.branchId = req.query.branchId as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.severity) filters.severity = req.query.severity as string;
    if (req.query.from) filters.from = new Date(req.query.from as string);
    if (req.query.to) filters.to = new Date(req.query.to as string);

    if (filters.from && Number.isNaN(filters.from.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from date' });
    }
    if (filters.to && Number.isNaN(filters.to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid to date' });
    }

    const requestedLimit = Number.parseInt(req.query.limit as string, 10);
    const requestedOffset = Number.parseInt(req.query.offset as string, 10);
    const incidents = await correlationService.getCorrelatedIncidents({
      ...filters,
      tenantId: req.user.tenantId,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 100,
      offset: Number.isFinite(requestedOffset) ? requestedOffset : 0,
    });

    res.json({
      success: true,
      data: incidents,
      count: incidents.length,
    });
  } catch (error) {
    console.error('Error getting correlated incidents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get incidents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== Panic Button Emergency ====================

/**
 * Get active panic emergencies
 * GET /api/v1/security-devices/panic/active
 */
router.get('/panic/active', authenticate, async (req: Request, res: Response) => {
  try {
    const emergencies = panicService.getActiveEmergencies();

    res.json({
      success: true,
      data: emergencies,
      count: emergencies.length,
    });
  } catch (error) {
    console.error('Error getting panic emergencies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get panic emergencies',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Acknowledge panic emergency
 * POST /api/v1/security-devices/panic/:panicEventId/acknowledge
 */
router.post(
  '/panic/:panicEventId/acknowledge',
  authenticate,
  requirePermission('emergency:acknowledge'),
  async (req: Request, res: Response) => {
    try {
      await panicService.acknowledgePanic(req.params.panicEventId, req.user.id);

      res.json({
        success: true,
        message: 'Panic emergency acknowledged',
      });
    } catch (error) {
      console.error('Error acknowledging panic:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge panic',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ==================== Device Statistics ====================

/**
 * Get device statistics by type
 * GET /api/v1/security-devices/statistics/by-type
 */
router.get('/statistics/by-type', authenticate, async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    
    // Get device statistics grouped by type
    const devices = await deviceService.getAllDevices({
      branchId,
      includeHealth: true,
    });

    const statistics = devices.reduce((acc, device) => {
      const type = device.deviceType;
      if (!acc[type]) {
        acc[type] = {
          type,
          total: 0,
          online: 0,
          offline: 0,
          degraded: 0,
          alarmed: 0,
        };
      }

      acc[type].total++;
      if (device.health?.status === 'online') acc[type].online++;
      if (device.health?.status === 'offline') acc[type].offline++;
      if (device.health?.status === 'degraded') acc[type].degraded++;
      if (device.health?.hasActiveAlarm) acc[type].alarmed++;

      return acc;
    }, {} as Record<string, any>);

    res.json({
      success: true,
      data: Object.values(statistics),
    });
  } catch (error) {
    console.error('Error getting device statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
