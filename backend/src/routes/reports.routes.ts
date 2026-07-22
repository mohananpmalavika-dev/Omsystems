/**
 * Reports API Routes
 * Endpoints for report generation, scheduling, and exports
 */

import { Router, Request, Response } from 'express';
import { reportsService } from '../services/reports.service';

const router = Router();

/**
 * GET /v1/reports/camera-health
 * Get camera health report data
 */
router.get('/camera-health', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getCameraHealthReport(tenantId, filters);
    
    res.json({
      success: true,
      data,
      summary: {
        totalCameras: data.length,
        healthy: data.filter(c => c.health_status === 'healthy').length,
        warning: data.filter(c => c.health_status === 'warning').length,
        critical: data.filter(c => c.health_status === 'critical').length,
        offline: data.filter(c => c.connectivity_status === 'offline').length
      }
    });
  } catch (error) {
    console.error('Error generating camera health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate camera health report'
    });
  }
});

/**
 * GET /v1/reports/recording-status
 * Get recording status report data
 */
router.get('/recording-status', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getRecordingStatusReport(tenantId, filters);
    
    res.json({
      success: true,
      data,
      summary: {
        totalRecordings: data.length,
        avgAvailability: data.reduce((sum, r) => sum + (r.availability_percentage || 0), 0) / data.length,
        withGaps: data.filter(r => r.gap_count > 0).length,
        notVerified: data.filter(r => !r.integrity_verified).length
      }
    });
  } catch (error) {
    console.error('Error generating recording status report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recording status report'
    });
  }
});

/**
 * GET /v1/reports/storage-utilization
 * Get storage utilization report data
 */
router.get('/storage-utilization', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    const data = await reportsService.getStorageUtilizationReport(tenantId, filters);
    
    // Convert BigInt to string for JSON serialization
    const serializedData = data.map(row => ({
      ...row,
      total_capacity_bytes: row.total_capacity_bytes?.toString(),
      used_capacity_bytes: row.used_capacity_bytes?.toString(),
      available_capacity_bytes: row.available_capacity_bytes?.toString(),
      daily_growth_bytes: row.daily_growth_bytes?.toString()
    }));
    
    res.json({
      success: true,
      data: serializedData
    });
  } catch (error) {
    console.error('Error generating storage report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate storage report'
    });
  }
});

/**
 * GET /v1/reports/incidents
 * Get incident register report data
 */
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    if (req.query.severity) {
      filters.severity = req.query.severity;
    }
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    const data = await reportsService.getIncidentRegisterReport(tenantId, filters);
    
    res.json({
      success: true,
      data,
      summary: {
        totalIncidents: data.length,
        critical: data.filter(i => i.severity === 'critical').length,
        high: data.filter(i => i.severity === 'high').length,
        open: data.filter(i => !['closed', 'resolved'].includes(i.status)).length,
        withPoliceReport: data.filter(i => i.police_reference).length,
        evidencePreserved: data.filter(i => i.evidence_preserved).length
      }
    });
  } catch (error) {
    console.error('Error generating incident register:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate incident register'
    });
  }
});

/**
 * GET /v1/reports/footage-access
 * Get footage retrieval log report data
 */
router.get('/footage-access', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getFootageRetrievalReport(tenantId, filters);
    
    res.json({
      success: true,
      data,
      summary: {
        totalAccess: data.length,
        searches: data.filter(r => r.action_type === 'search').length,
        playbacks: data.filter(r => r.action_type === 'playback').length,
        exports: data.filter(r => r.action_type === 'export').length,
        requireApproval: data.filter(r => r.approval_required).length,
        externalShares: data.filter(r => r.recipient).length
      }
    });
  } catch (error) {
    console.error('Error generating footage access report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate footage access report'
    });
  }
});

/**
 * GET /v1/reports/maintenance
 * Get maintenance log report data
 */
router.get('/maintenance', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getMaintenanceLogReport(tenantId, filters);
    
    res.json({
      success: true,
      data,
      summary: {
        totalWorkOrders: data.length,
        open: data.filter(w => !['completed', 'closed'].includes(w.status)).length,
        overdue: data.filter(w => w.scheduled_date && new Date(w.scheduled_date) < new Date() && !w.completed_at).length,
        preventive: data.filter(w => w.work_type === 'preventive').length,
        corrective: data.filter(w => w.work_type === 'corrective').length,
        slaBreached: data.filter(w => w.sla_status === 'breached').length
      }
    });
  } catch (error) {
    console.error('Error generating maintenance report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate maintenance report'
    });
  }
});

/**
 * GET /v1/reports/downtime
 * Get downtime report data
 */
router.get('/downtime', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getDowntimeReport(tenantId, filters);
    
    const totalDowntime = data.reduce((sum, d) => sum + (d.duration_minutes || 0), 0);
    const plannedDowntime = data.filter(d => d.planned).reduce((sum, d) => sum + (d.duration_minutes || 0), 0);
    const unplannedDowntime = totalDowntime - plannedDowntime;
    
    res.json({
      success: true,
      data,
      summary: {
        totalEvents: data.length,
        totalDowntimeMinutes: totalDowntime,
        plannedDowntimeMinutes: plannedDowntime,
        unplannedDowntimeMinutes: unplannedDowntime,
        slaBreached: data.filter(d => d.sla_breached).length,
        cameraDowntime: data.filter(d => d.asset_type === 'camera').length,
        storageDowntime: data.filter(d => d.asset_type === 'storage').length
      }
    });
  } catch (error) {
    console.error('Error generating downtime report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate downtime report'
    });
  }
});

/**
 * GET /v1/reports/alerts
 * Get alert summary report data
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { tenantId, userScope } = req.context;
    
    const filters: any = {};
    
    if (req.query.branchIds) {
      filters.branchIds = Array.isArray(req.query.branchIds) 
        ? req.query.branchIds 
        : [req.query.branchIds];
    }
    
    if (req.query.from && req.query.to) {
      filters.dateRange = {
        from: new Date(req.query.from as string),
        to: new Date(req.query.to as string)
      };
    }
    
    const data = await reportsService.getAlertSummaryReport(tenantId, filters);
    
    const acknowledged = data.filter(a => a.acknowledged_at);
    const avgAckTime = acknowledged.length > 0
      ? acknowledged.reduce((sum, a) => sum + (a.acknowledgment_time_minutes || 0), 0) / acknowledged.length
      : 0;
    
    const resolved = data.filter(a => a.resolved_at);
    const avgResolutionTime = resolved.length > 0
      ? resolved.reduce((sum, a) => sum + (a.resolution_time_minutes || 0), 0) / resolved.length
      : 0;
    
    res.json({
      success: true,
      data,
      summary: {
        totalAlerts: data.length,
        critical: data.filter(a => a.severity === 'critical').length,
        high: data.filter(a => a.severity === 'high').length,
        escalated: data.filter(a => a.escalated_at).length,
        falseAlarms: data.filter(a => a.false_alarm).length,
        convertedToIncidents: data.filter(a => a.incident_number).length,
        avgAcknowledgmentMinutes: Math.round(avgAckTime),
        avgResolutionMinutes: Math.round(avgResolutionTime)
      }
    });
  } catch (error) {
    console.error('Error generating alert summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate alert summary'
    });
  }
});

export default router;
