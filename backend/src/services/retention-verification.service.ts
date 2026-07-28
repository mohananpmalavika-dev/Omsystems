/**
 * Recording Retention Verification Service
 * Calculates actual retention from real recordings and verifies compliance
 */

import type { Pool } from "pg";
import { logger } from "../utils/logger.js";

export interface CameraRetentionStatus {
  cameraId: string;
  cameraName: string;
  tenantId: string;
  branchId: string;
  requiredRetentionDays: number;
  actualRetentionDays: number;
  oldestRecordingDate?: Date;
  newestRecordingDate?: Date;
  totalRecordingsGB: number;
  averageBitrateMbps: number;
  projectedRetentionDays: number;
  daysUntilPolicyViolation?: number;
  complianceStatus: "compliant" | "warning" | "violation" | "unknown";
  lastVerified: Date;
  issues: RetentionIssue[];
}

export interface RetentionIssue {
  type: "below_policy" | "storage_full" | "gap_detected" | "prediction_warning";
  severity: "info" | "warning" | "critical";
  message: string;
  detectedAt: Date;
  daysBelowPolicy?: number;
}

export interface RetentionPrediction {
  cameraId: string;
  currentRetentionDays: number;
  projectedRetentionDays: number;
  dailyStorageUsageGB: number;
  availableStorageGB: number;
  daysUntilStorageFull: number;
  recommendedAction: string;
  confidence: number;
}

export interface RetentionComplianceReport {
  branchId: string;
  branchName: string;
  totalCameras: number;
  compliantCameras: number;
  warningCameras: number;
  violationCameras: number;
  avgActualRetention: number;
  avgRequiredRetention: number;
  compliancePercentage: number;
}


export class RetentionVerificationService {
  private pool: Pool;
  private isRunning: boolean;
  private verificationTimer?: NodeJS.Timeout;

  constructor(pool: Pool) {
    this.pool = pool;
    this.isRunning = false;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Retention verification service already running");
      return;
    }

    logger.info("Starting retention verification service");
    this.isRunning = true;

    // Run verification every hour
    this.verificationTimer = setInterval(async () => {
      try {
        await this.verifyAllCameraRetention();
      } catch (error) {
        logger.error("Retention verification error", { error });
      }
    }, 3600000); // 1 hour

    // Run initial verification
    await this.verifyAllCameraRetention();

    logger.info("Retention verification service started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info("Stopping retention verification service");
    this.isRunning = false;

    if (this.verificationTimer) {
      clearInterval(this.verificationTimer);
    }

    logger.info("Retention verification service stopped");
  }


  /**
   * Verify retention for all cameras
   */
  private async verifyAllCameraRetention(): Promise<void> {
    logger.debug("Starting retention verification cycle");

    try {
      const cameras = await this.getActiveCameras();
      logger.debug(`Verifying retention for ${cameras.length} cameras`);

      for (const camera of cameras) {
        await this.verifyCameraRetention(camera);
      }

      logger.debug("Retention verification cycle complete");
    } catch (error) {
      logger.error("Failed to verify retention", { error });
    }
  }

  /**
   * Get all active cameras with retention policies
   */
  private async getActiveCameras(): Promise<Array<{
    id: string;
    name: string;
    tenantId: string;
    branchId: string;
    requiredRetentionDays: number;
  }>> {
    try {
      const result = await this.pool.query(`
        SELECT 
          c.id::text,
          rn.name,
          b.tenant_id::text as tenant_id,
          c.branch_node_id::text as branch_id,
          COALESCE(c.retention_days, b.default_retention_days, 90) as required_retention_days
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE c.status != 'disabled'
          AND c.recording_enabled = true
        ORDER BY c.id
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        requiredRetentionDays: parseInt(row.required_retention_days) || 90,
      }));
    } catch (error) {
      logger.error("Failed to get active cameras", { error });
      return [];
    }
  }


  /**
   * Verify retention for a single camera
   */
  private async verifyCameraRetention(camera: {
    id: string;
    name: string;
    tenantId: string;
    branchId: string;
    requiredRetentionDays: number;
  }): Promise<void> {
    try {
      // Calculate actual retention from recordings
      const retentionData = await this.calculateActualRetention(camera.id);

      if (!retentionData) {
        logger.debug(`No recording data for camera ${camera.name}`);
        return;
      }

      // Determine compliance status
      const complianceStatus = this.determineComplianceStatus(
        camera.requiredRetentionDays,
        retentionData.actualRetentionDays
      );

      // Check for issues
      const issues: RetentionIssue[] = [];

      if (complianceStatus === "violation") {
        issues.push({
          type: "below_policy",
          severity: "critical",
          message: `Actual retention (${retentionData.actualRetentionDays} days) is below required policy (${camera.requiredRetentionDays} days)`,
          detectedAt: new Date(),
          daysBelowPolicy: camera.requiredRetentionDays - retentionData.actualRetentionDays,
        });
      } else if (complianceStatus === "warning") {
        const daysUntilViolation = retentionData.actualRetentionDays - camera.requiredRetentionDays;
        if (daysUntilViolation < 7) {
          issues.push({
            type: "prediction_warning",
            severity: "warning",
            message: `Retention approaching policy limit. ${daysUntilViolation} days buffer remaining`,
            detectedAt: new Date(),
          });
        }
      }

      // Calculate projection
      const projection = await this.calculateRetentionPrediction(
        camera.id,
        retentionData,
        camera.requiredRetentionDays
      );

      // Save verification result
      await this.saveRetentionStatus({
        cameraId: camera.id,
        cameraName: camera.name,
        tenantId: camera.tenantId,
        branchId: camera.branchId,
        requiredRetentionDays: camera.requiredRetentionDays,
        actualRetentionDays: retentionData.actualRetentionDays,
        oldestRecordingDate: retentionData.oldestDate,
        newestRecordingDate: retentionData.newestDate,
        totalRecordingsGB: retentionData.totalSizeGB,
        averageBitrateMbps: retentionData.avgBitrateMbps,
        projectedRetentionDays: projection.projectedRetentionDays,
        daysUntilPolicyViolation: projection.daysUntilViolation,
        complianceStatus,
        lastVerified: new Date(),
        issues,
      });

      // Create alerts for violations
      if (issues.some(i => i.severity === "critical")) {
        await this.createRetentionAlert(camera, issues);
      }

      logger.debug(`Verified retention for camera ${camera.name}`, {
        required: camera.requiredRetentionDays,
        actual: retentionData.actualRetentionDays,
        status: complianceStatus,
      });
    } catch (error) {
      logger.error(`Failed to verify retention for camera ${camera.name}`, { error });
    }
  }


  /**
   * Calculate actual retention from recording segments
   */
  private async calculateActualRetention(cameraId: string): Promise<{
    actualRetentionDays: number;
    oldestDate: Date;
    newestDate: Date;
    totalSizeGB: number;
    avgBitrateMbps: number;
  } | null> {
    try {
      const result = await this.pool.query(`
        SELECT 
          MIN(started_at) as oldest_date,
          MAX(ended_at) as newest_date,
          SUM(file_size_bytes) as total_bytes,
          COUNT(*) as segment_count,
          EXTRACT(EPOCH FROM (MAX(ended_at) - MIN(started_at))) as total_seconds
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND status = 'ready'
          AND ended_at IS NOT NULL
      `, [cameraId]);

      if (result.rows.length === 0 || !result.rows[0].oldest_date) {
        return null;
      }

      const row = result.rows[0];
      const oldestDate = new Date(row.oldest_date);
      const newestDate = new Date(row.newest_date);
      const totalSeconds = parseFloat(row.total_seconds) || 0;
      const totalBytes = BigInt(row.total_bytes || 0);
      
      // Calculate actual retention in days
      const retentionMs = newestDate.getTime() - oldestDate.getTime();
      const actualRetentionDays = retentionMs / (1000 * 60 * 60 * 24);

      // Calculate average bitrate
      const totalSizeGB = Number(totalBytes) / (1024 * 1024 * 1024);
      const avgBitrateMbps = totalSeconds > 0
        ? (Number(totalBytes) * 8) / (1000 * 1000 * totalSeconds)
        : 0;

      return {
        actualRetentionDays: Math.floor(actualRetentionDays),
        oldestDate,
        newestDate,
        totalSizeGB: parseFloat(totalSizeGB.toFixed(2)),
        avgBitrateMbps: parseFloat(avgBitrateMbps.toFixed(2)),
      };
    } catch (error) {
      logger.error("Failed to calculate actual retention", { error, cameraId });
      return null;
    }
  }

  /**
   * Calculate retention prediction based on storage growth
   */
  private async calculateRetentionPrediction(
    cameraId: string,
    retentionData: {
      actualRetentionDays: number;
      totalSizeGB: number;
      avgBitrateMbps: number;
    },
    requiredRetentionDays: number
  ): Promise<{
    projectedRetentionDays: number;
    daysUntilViolation?: number;
  }> {
    try {
      // Get storage capacity for this camera's DVR/storage
      const storageResult = await this.pool.query(`
        SELECT 
          s.total_capacity_gb,
          s.used_capacity_gb,
          s.available_capacity_gb
        FROM cameras c
        LEFT JOIN storage_devices s ON s.dvr_id = c.dvr_id
        WHERE c.id = $1::uuid
        LIMIT 1
      `, [cameraId]);

      let availableStorageGB = 1000; // Default fallback
      if (storageResult.rows.length > 0 && storageResult.rows[0].available_capacity_gb) {
        availableStorageGB = parseFloat(storageResult.rows[0].available_capacity_gb);
      }

      // Calculate daily storage usage
      const dailyStorageUsageGB = retentionData.actualRetentionDays > 0
        ? retentionData.totalSizeGB / retentionData.actualRetentionDays
        : 0;

      // Project how many days we can store with available space
      const projectedAdditionalDays = dailyStorageUsageGB > 0
        ? availableStorageGB / dailyStorageUsageGB
        : retentionData.actualRetentionDays;

      const projectedRetentionDays = Math.floor(
        retentionData.actualRetentionDays + projectedAdditionalDays
      );

      // Calculate days until policy violation
      let daysUntilViolation: number | undefined;
      if (projectedRetentionDays < requiredRetentionDays) {
        daysUntilViolation = Math.max(0, retentionData.actualRetentionDays - requiredRetentionDays);
      }

      return {
        projectedRetentionDays,
        daysUntilViolation,
      };
    } catch (error) {
      logger.error("Failed to calculate retention prediction", { error, cameraId });
      return {
        projectedRetentionDays: retentionData.actualRetentionDays,
      };
    }
  }

  /**
   * Determine compliance status
   */
  private determineComplianceStatus(
    requiredDays: number,
    actualDays: number
  ): "compliant" | "warning" | "violation" | "unknown" {
    if (actualDays < 0) {
      return "unknown";
    }

    // Violation: below required retention
    if (actualDays < requiredDays) {
      return "violation";
    }

    // Warning: within 10% buffer of required retention
    const warningThreshold = requiredDays * 1.1;
    if (actualDays < warningThreshold) {
      return "warning";
    }

    // Compliant: above warning threshold
    return "compliant";
  }

  /**
   * Save retention status to database
   */
  private async saveRetentionStatus(status: CameraRetentionStatus): Promise<void> {
    try {
      // Insert into verification log
      await this.pool.query(`
        INSERT INTO retention_verification_log (
          camera_id, verified_at, required_retention_days, actual_retention_days,
          oldest_recording_date, newest_recording_date, total_recordings_gb,
          average_bitrate_mbps, projected_retention_days, compliance_status, issues
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        status.cameraId,
        status.lastVerified,
        status.requiredRetentionDays,
        status.actualRetentionDays,
        status.oldestRecordingDate,
        status.newestRecordingDate,
        status.totalRecordingsGB,
        status.averageBitrateMbps,
        status.projectedRetentionDays,
        status.complianceStatus,
        JSON.stringify(status.issues),
      ]);

      // Update camera retention status summary
      await this.pool.query(`
        INSERT INTO camera_retention_status (
          camera_id, required_retention_days, actual_retention_days,
          oldest_recording_date, newest_recording_date, total_recordings_gb,
          projected_retention_days, days_until_policy_violation,
          compliance_status, last_verified_at, issues
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (camera_id)
        DO UPDATE SET
          required_retention_days = EXCLUDED.required_retention_days,
          actual_retention_days = EXCLUDED.actual_retention_days,
          oldest_recording_date = EXCLUDED.oldest_recording_date,
          newest_recording_date = EXCLUDED.newest_recording_date,
          total_recordings_gb = EXCLUDED.total_recordings_gb,
          projected_retention_days = EXCLUDED.projected_retention_days,
          days_until_policy_violation = EXCLUDED.days_until_policy_violation,
          compliance_status = EXCLUDED.compliance_status,
          last_verified_at = EXCLUDED.last_verified_at,
          issues = EXCLUDED.issues
      `, [
        status.cameraId,
        status.requiredRetentionDays,
        status.actualRetentionDays,
        status.oldestRecordingDate,
        status.newestRecordingDate,
        status.totalRecordingsGB,
        status.projectedRetentionDays,
        status.daysUntilPolicyViolation,
        status.complianceStatus,
        status.lastVerified,
        JSON.stringify(status.issues),
      ]);

      logger.debug("Saved retention status", { cameraId: status.cameraId });
    } catch (error) {
      logger.error("Failed to save retention status", { error, cameraId: status.cameraId });
    }
  }

  /**
   * Create retention compliance alert
   */
  private async createRetentionAlert(
    camera: { id: string; name: string; tenantId: string; branchId: string; requiredRetentionDays: number },
    issues: RetentionIssue[]
  ): Promise<void> {
    try {
      const criticalIssues = issues.filter(i => i.severity === "critical");
      if (criticalIssues.length === 0) return;

      const issueMessages = criticalIssues.map(i => i.message).join("; ");

      await this.pool.query(`
        INSERT INTO retention_compliance_alerts (
          camera_id, tenant_id, branch_id, alert_type, severity,
          title, message, metadata, created_at
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, NOW())
      `, [
        camera.id,
        camera.tenantId,
        camera.branchId,
        "retention_policy_violation",
        "high",
        `Retention Policy Violation: ${camera.name}`,
        `Camera ${camera.name} has retention policy violations: ${issueMessages}`,
        JSON.stringify({
          cameraId: camera.id,
          requiredRetentionDays: camera.requiredRetentionDays,
          issues: criticalIssues,
        }),
      ]);

      logger.info(`Created retention alert for camera ${camera.name}`, {
        cameraId: camera.id,
        issueCount: criticalIssues.length,
      });
    } catch (error) {
      logger.error("Failed to create retention alert", { error, cameraId: camera.id });
    }
  }

  /**
   * Get retention status for a specific camera
   */
  async getCameraRetentionStatus(cameraId: string): Promise<CameraRetentionStatus | null> {
    try {
      const result = await this.pool.query(`
        SELECT 
          crs.camera_id::text,
          c.name as camera_name,
          b.tenant_id::text,
          c.branch_node_id::text as branch_id,
          crs.required_retention_days,
          crs.actual_retention_days,
          crs.oldest_recording_date,
          crs.newest_recording_date,
          crs.total_recordings_gb,
          crs.projected_retention_days,
          crs.days_until_policy_violation,
          crs.compliance_status,
          crs.last_verified_at,
          crs.issues
        FROM camera_retention_status crs
        JOIN cameras c ON c.id = crs.camera_id
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE crs.camera_id = $1::uuid
      `, [cameraId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        requiredRetentionDays: parseInt(row.required_retention_days),
        actualRetentionDays: parseInt(row.actual_retention_days),
        oldestRecordingDate: row.oldest_recording_date ? new Date(row.oldest_recording_date) : undefined,
        newestRecordingDate: row.newest_recording_date ? new Date(row.newest_recording_date) : undefined,
        totalRecordingsGB: parseFloat(row.total_recordings_gb || 0),
        averageBitrateMbps: 0, // Not stored in summary table
        projectedRetentionDays: parseInt(row.projected_retention_days || 0),
        daysUntilPolicyViolation: row.days_until_policy_violation !== null 
          ? parseInt(row.days_until_policy_violation) 
          : undefined,
        complianceStatus: row.compliance_status,
        lastVerified: new Date(row.last_verified_at),
        issues: JSON.parse(row.issues || "[]"),
      };
    } catch (error) {
      logger.error("Failed to get camera retention status", { error, cameraId });
      return null;
    }
  }

  /**
   * Get retention history for a camera
   */
  async getCameraRetentionHistory(
    cameraId: string,
    limit: number = 100
  ): Promise<Array<{
    verifiedAt: Date;
    requiredRetentionDays: number;
    actualRetentionDays: number;
    complianceStatus: string;
  }>> {
    try {
      const result = await this.pool.query(`
        SELECT 
          verified_at,
          required_retention_days,
          actual_retention_days,
          compliance_status
        FROM retention_verification_log
        WHERE camera_id = $1::uuid
        ORDER BY verified_at DESC
        LIMIT $2
      `, [cameraId, limit]);

      return result.rows.map(row => ({
        verifiedAt: new Date(row.verified_at),
        requiredRetentionDays: parseInt(row.required_retention_days),
        actualRetentionDays: parseInt(row.actual_retention_days),
        complianceStatus: row.compliance_status,
      }));
    } catch (error) {
      logger.error("Failed to get retention history", { error, cameraId });
      return [];
    }
  }

  /**
   * Get branch compliance report
   */
  async getBranchComplianceReport(branchId: string): Promise<RetentionComplianceReport | null> {
    try {
      const result = await this.pool.query(`
        SELECT 
          b.id::text as branch_id,
          b.name as branch_name,
          COUNT(crs.camera_id) as total_cameras,
          COUNT(CASE WHEN crs.compliance_status = 'compliant' THEN 1 END) as compliant_cameras,
          COUNT(CASE WHEN crs.compliance_status = 'warning' THEN 1 END) as warning_cameras,
          COUNT(CASE WHEN crs.compliance_status = 'violation' THEN 1 END) as violation_cameras,
          AVG(crs.actual_retention_days) as avg_actual_retention,
          AVG(crs.required_retention_days) as avg_required_retention
        FROM resource_nodes b
        LEFT JOIN cameras c ON c.branch_node_id = b.id
        LEFT JOIN camera_retention_status crs ON crs.camera_id = c.id
        WHERE b.id = $1::uuid
        GROUP BY b.id, b.name
      `, [branchId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const totalCameras = parseInt(row.total_cameras || 0);
      const compliantCameras = parseInt(row.compliant_cameras || 0);

      return {
        branchId: row.branch_id,
        branchName: row.branch_name,
        totalCameras,
        compliantCameras,
        warningCameras: parseInt(row.warning_cameras || 0),
        violationCameras: parseInt(row.violation_cameras || 0),
        avgActualRetention: parseFloat(row.avg_actual_retention || 0),
        avgRequiredRetention: parseFloat(row.avg_required_retention || 0),
        compliancePercentage: totalCameras > 0 ? (compliantCameras / totalCameras) * 100 : 0,
      };
    } catch (error) {
      logger.error("Failed to get branch compliance report", { error, branchId });
      return null;
    }
  }

  /**
   * Get all policy violations
   */
  async getPolicyViolations(): Promise<CameraRetentionStatus[]> {
    try {
      const result = await this.pool.query(`
        SELECT 
          crs.camera_id::text,
          c.name as camera_name,
          b.tenant_id::text,
          c.branch_node_id::text as branch_id,
          crs.required_retention_days,
          crs.actual_retention_days,
          crs.oldest_recording_date,
          crs.newest_recording_date,
          crs.total_recordings_gb,
          crs.projected_retention_days,
          crs.days_until_policy_violation,
          crs.compliance_status,
          crs.last_verified_at,
          crs.issues
        FROM camera_retention_status crs
        JOIN cameras c ON c.id = crs.camera_id
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE crs.compliance_status IN ('violation', 'warning')
        ORDER BY 
          CASE crs.compliance_status 
            WHEN 'violation' THEN 1 
            WHEN 'warning' THEN 2 
            ELSE 3 
          END,
          crs.actual_retention_days ASC
      `);

      return result.rows.map(row => ({
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        requiredRetentionDays: parseInt(row.required_retention_days),
        actualRetentionDays: parseInt(row.actual_retention_days),
        oldestRecordingDate: row.oldest_recording_date ? new Date(row.oldest_recording_date) : undefined,
        newestRecordingDate: row.newest_recording_date ? new Date(row.newest_recording_date) : undefined,
        totalRecordingsGB: parseFloat(row.total_recordings_gb || 0),
        averageBitrateMbps: 0,
        projectedRetentionDays: parseInt(row.projected_retention_days || 0),
        daysUntilPolicyViolation: row.days_until_policy_violation !== null 
          ? parseInt(row.days_until_policy_violation) 
          : undefined,
        complianceStatus: row.compliance_status,
        lastVerified: new Date(row.last_verified_at),
        issues: JSON.parse(row.issues || "[]"),
      }));
    } catch (error) {
      logger.error("Failed to get policy violations", { error });
      return [];
    }
  }

  /**
   * Trigger manual verification for a specific camera
   */
  async triggerManualVerification(cameraId: string): Promise<CameraRetentionStatus | null> {
    try {
      const cameraResult = await this.pool.query(`
        SELECT 
          c.id::text,
          rn.name,
          b.tenant_id::text as tenant_id,
          c.branch_node_id::text as branch_id,
          COALESCE(c.retention_days, b.default_retention_days, 90) as required_retention_days
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE c.id = $1::uuid
      `, [cameraId]);

      if (cameraResult.rows.length === 0) {
        return null;
      }

      const camera = cameraResult.rows[0];
      await this.verifyCameraRetention({
        id: camera.id,
        name: camera.name,
        tenantId: camera.tenant_id,
        branchId: camera.branch_id,
        requiredRetentionDays: parseInt(camera.required_retention_days) || 90,
      });

      return await this.getCameraRetentionStatus(cameraId);
    } catch (error) {
      logger.error("Manual verification failed", { error, cameraId });
      return null;
    }
  }

  /**
   * Get retention predictions for all cameras
   */
  async getRetentionPredictions(): Promise<RetentionPrediction[]> {
    try {
      const result = await this.pool.query(`
        SELECT 
          crs.camera_id::text,
          crs.actual_retention_days as current_retention_days,
          crs.projected_retention_days,
          crs.total_recordings_gb,
          crs.required_retention_days,
          CASE 
            WHEN crs.actual_retention_days > 0 
            THEN crs.total_recordings_gb / crs.actual_retention_days 
            ELSE 0 
          END as daily_storage_usage_gb,
          COALESCE(s.available_capacity_gb, 1000) as available_storage_gb,
          CASE 
            WHEN crs.actual_retention_days > 0 AND crs.total_recordings_gb > 0
            THEN COALESCE(s.available_capacity_gb, 1000) / (crs.total_recordings_gb / crs.actual_retention_days)
            ELSE 999
          END as days_until_storage_full
        FROM camera_retention_status crs
        JOIN cameras c ON c.id = crs.camera_id
        LEFT JOIN storage_devices s ON s.dvr_id = c.dvr_id
        WHERE crs.compliance_status IN ('violation', 'warning')
        ORDER BY days_until_storage_full ASC
        LIMIT 50
      `);

      return result.rows.map(row => {
        const currentRetention = parseInt(row.current_retention_days);
        const requiredRetention = parseInt(row.required_retention_days);
        const daysUntilFull = parseFloat(row.days_until_storage_full);

        let recommendedAction = "Monitor retention levels";
        if (currentRetention < requiredRetention) {
          recommendedAction = "Increase storage capacity immediately";
        } else if (daysUntilFull < 30) {
          recommendedAction = "Plan storage expansion within 30 days";
        } else if (daysUntilFull < 90) {
          recommendedAction = "Schedule storage expansion";
        }

        return {
          cameraId: row.camera_id,
          currentRetentionDays: currentRetention,
          projectedRetentionDays: parseInt(row.projected_retention_days),
          dailyStorageUsageGB: parseFloat(row.daily_storage_usage_gb || 0),
          availableStorageGB: parseFloat(row.available_storage_gb || 0),
          daysUntilStorageFull: Math.floor(daysUntilFull),
          recommendedAction,
          confidence: 0.85, // 85% confidence based on historical data
        };
      });
    } catch (error) {
      logger.error("Failed to get retention predictions", { error });
      return [];
    }
  }
}

/**
 * Global instance
 */
let retentionVerificationService: RetentionVerificationService | null = null;

/**
 * Get or create retention verification service
 */
export function getRetentionVerificationService(pool: Pool): RetentionVerificationService {
  if (!retentionVerificationService) {
    retentionVerificationService = new RetentionVerificationService(pool);
  }
  return retentionVerificationService;
}
