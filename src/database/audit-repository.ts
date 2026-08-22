import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

type JsonRecord = Record<string, unknown>;

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelRow<T = JsonRecord>(row: JsonRecord): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelKey(key),
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

function camelRows<T = JsonRecord>(rows: JsonRecord[]): T[] {
  return rows.map((row) => camelRow<T>(row));
}

function buildUpdateStatement(values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
  const params = entries.map(([, value]) => value);
  return { assignments, params };
}

/**
 * Audit Repository - Handles health monitoring, recording verification, maintenance, and access logs
 */
export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  // ============================================================================
  // CAMERA HEALTH CHECKS
  // ============================================================================

  async createCameraHealthCheck(input: any) {
    const result = await this.pool.query(
      `INSERT INTO camera_health_checks (
        id, tenant_id, camera_id, branch_node_id, check_timestamp,
        is_online, rtsp_available, onvif_available, latency_ms, packet_loss_percentage,
        current_fps, current_bitrate_kbps, resolution_width, resolution_height,
        video_loss, frozen_image, black_image, blurred_image, obstructed, tampering_detected,
        camera_time, time_offset_seconds, ntp_synced, is_recording, recording_destination,
        last_recording_time, firmware_version, temperature_celsius, power_status,
        overall_status, health_score, issues_detected, alert_generated, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.cameraId,
        input.branchNodeId ?? null,
        input.checkTimestamp ?? new Date().toISOString(),
        input.isOnline,
        input.rtspAvailable ?? null,
        input.onvifAvailable ?? null,
        input.latencyMs ?? null,
        input.packetLossPercentage ?? null,
        input.currentFps ?? null,
        input.currentBitrateKbps ?? null,
        input.resolutionWidth ?? null,
        input.resolutionHeight ?? null,
        input.videoLoss ?? false,
        input.frozenImage ?? false,
        input.blackImage ?? false,
        input.blurredImage ?? false,
        input.obstructed ?? false,
        input.tamperingDetected ?? false,
        input.cameraTime ?? null,
        input.timeOffsetSeconds ?? null,
        input.ntpSynced ?? null,
        input.isRecording ?? null,
        input.recordingDestination ?? null,
        input.lastRecordingTime ?? null,
        input.firmwareVersion ?? null,
        input.temperatureCelsius ?? null,
        input.powerStatus ?? null,
        input.overallStatus,
        input.healthScore ?? null,
        input.issuesDetected ? JSON.stringify(input.issuesDetected) : null,
        input.alertGenerated ?? false,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listCameraHealthChecks(
    tenantId: string,
    filters?: {
      cameraId?: string;
      branchNodeId?: string;
      status?: string;
      from?: string;
      to?: string;
      limit?: number;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        chc.*,
        c.name as camera_name,
        c.location as camera_location,
        n.name as branch_name
      FROM camera_health_checks chc
      LEFT JOIN cameras c ON c.id = chc.camera_id
      LEFT JOIN organizational_nodes n ON n.id = chc.branch_node_id
      WHERE chc.tenant_id = $1
        AND ($2::uuid IS NULL OR chc.camera_id = $2)
        AND ($3::uuid IS NULL OR chc.branch_node_id = $3)
        AND ($4::text IS NULL OR chc.overall_status = $4)
        AND ($5::timestamptz IS NULL OR chc.check_timestamp >= $5)
        AND ($6::timestamptz IS NULL OR chc.check_timestamp <= $6)
      ORDER BY chc.check_timestamp DESC
      LIMIT $7`,
      [
        tenantId,
        filters?.cameraId ?? null,
        filters?.branchNodeId ?? null,
        filters?.status ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.limit ?? 100,
      ]
    );
    return camelRows(result.rows);
  }

  async getCameraHealthLatest(cameraId: string) {
    const result = await this.pool.query(
      `SELECT * FROM camera_health_latest WHERE camera_id = $1`,
      [cameraId]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async refreshCameraHealthLatest() {
    await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY camera_health_latest');
  }

  async getCameraHealthSummary(tenantId: string, branchNodeId?: string) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT CASE WHEN chl.is_online = true THEN c.id END) as online_cameras,
        COUNT(DISTINCT CASE WHEN chl.is_recording = true THEN c.id END) as recording_cameras,
        COUNT(DISTINCT CASE WHEN chl.overall_status = 'healthy' THEN c.id END) as healthy_cameras,
        COUNT(DISTINCT CASE WHEN chl.overall_status = 'warning' THEN c.id END) as warning_cameras,
        COUNT(DISTINCT CASE WHEN chl.overall_status = 'degraded' THEN c.id END) as degraded_cameras,
        COUNT(DISTINCT CASE WHEN chl.overall_status = 'critical' THEN c.id END) as critical_cameras,
        COUNT(DISTINCT CASE WHEN chl.overall_status = 'offline' THEN c.id END) as offline_cameras,
        AVG(chl.health_score) as avg_health_score
      FROM cameras c
      LEFT JOIN camera_health_latest chl ON chl.camera_id = c.id
      WHERE c.tenant_id = $1
        AND ($2::uuid IS NULL OR c.branch_node_id = $2)`,
      [tenantId, branchNodeId ?? null]
    );
    return camelRow(result.rows[0]);
  }

  // ============================================================================
  // CAMERA QUALITY CHECKS
  // ============================================================================

  async createCameraQualityCheck(input: any) {
    const result = await this.pool.query(
      `INSERT INTO camera_quality_checks (
        id, tenant_id, camera_id, branch_node_id, check_date, check_time,
        resolution_actual, resolution_expected, resolution_compliant,
        fps_actual, fps_expected, fps_compliant,
        bitrate_actual_kbps, bitrate_expected_kbps, bitrate_compliant,
        clarity_score, lighting_adequate, focus_quality, color_accuracy,
        viewing_angle_adequate, coverage_area_compliant, no_blind_spots,
        timestamp_visible, camera_id_visible, codec_compliant, compression_artifacts_detected,
        audio_enabled, audio_quality_adequate, playback_successful, frame_continuity,
        no_corruption, overall_quality_score, quality_rating, deficiencies_found,
        recommendations, checked_by, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.cameraId,
        input.branchNodeId ?? null,
        input.checkDate ?? new Date().toISOString().split('T')[0],
        input.checkTime ?? new Date().toISOString(),
        input.resolutionActual ?? null,
        input.resolutionExpected ?? null,
        input.resolutionCompliant ?? null,
        input.fpsActual ?? null,
        input.fpsExpected ?? null,
        input.fpsCompliant ?? null,
        input.bitrateActualKbps ?? null,
        input.bitrateExpectedKbps ?? null,
        input.bitrateCompliant ?? null,
        input.clarityScore ?? null,
        input.lightingAdequate ?? null,
        input.focusQuality ?? null,
        input.colorAccuracy ?? null,
        input.viewingAngleAdequate ?? null,
        input.coverageAreaCompliant ?? null,
        input.noBlindSpots ?? null,
        input.timestampVisible ?? null,
        input.cameraIdVisible ?? null,
        input.codecCompliant ?? null,
        input.compressionArtifactsDetected ?? null,
        input.audioEnabled ?? null,
        input.audioQualityAdequate ?? null,
        input.playbackSuccessful ?? null,
        input.frameContinuity ?? null,
        input.noCorruption ?? null,
        input.overallQualityScore ?? null,
        input.qualityRating ?? null,
        input.deficienciesFound ? JSON.stringify(input.deficienciesFound) : null,
        input.recommendations ?? null,
        input.checkedBy ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listCameraQualityChecks(
    tenantId: string,
    filters?: { cameraId?: string; branchNodeId?: string; from?: string; to?: string; rating?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        cqc.*,
        c.name as camera_name,
        n.name as branch_name,
        u.name as checked_by_name
      FROM camera_quality_checks cqc
      LEFT JOIN cameras c ON c.id = cqc.camera_id
      LEFT JOIN organizational_nodes n ON n.id = cqc.branch_node_id
      LEFT JOIN users u ON u.id = cqc.checked_by
      WHERE cqc.tenant_id = $1
        AND ($2::uuid IS NULL OR cqc.camera_id = $2)
        AND ($3::uuid IS NULL OR cqc.branch_node_id = $3)
        AND ($4::date IS NULL OR cqc.check_date >= $4)
        AND ($5::date IS NULL OR cqc.check_date <= $5)
        AND ($6::text IS NULL OR cqc.quality_rating = $6)
      ORDER BY cqc.check_date DESC, cqc.check_time DESC`,
      [
        tenantId,
        filters?.cameraId ?? null,
        filters?.branchNodeId ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.rating ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  async getCameraQualityCheck(id: string) {
    const result = await this.pool.query('SELECT * FROM camera_quality_checks WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  // ============================================================================
  // RECORDING VERIFICATION
  // ============================================================================

  async createRecordingVerificationJob(input: any) {
    const result = await this.pool.query(
      `INSERT INTO recording_verification_jobs (
        id, tenant_id, camera_id, branch_node_id, verification_date,
        verification_period_start, verification_period_end, expected_duration_seconds,
        actual_duration_seconds, recording_availability_percentage, total_gaps,
        largest_gap_seconds, gap_details, total_segments, segments_verified,
        segments_with_errors, checksum_failures, decode_failures, playback_failures,
        timestamp_continuity_verified, timestamp_issues_found, storage_location,
        storage_accessible, legal_hold_active, retention_policy_met,
        verification_status, compliance_percentage, issues_summary, verified_by,
        metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.cameraId,
        input.branchNodeId ?? null,
        input.verificationDate ?? new Date().toISOString().split('T')[0],
        input.verificationPeriodStart,
        input.verificationPeriodEnd,
        input.expectedDurationSeconds,
        input.actualDurationSeconds ?? null,
        input.recordingAvailabilityPercentage ?? null,
        input.totalGaps ?? 0,
        input.largestGapSeconds ?? null,
        input.gapDetails ? JSON.stringify(input.gapDetails) : null,
        input.totalSegments ?? null,
        input.segmentsVerified ?? null,
        input.segmentsWithErrors ?? null,
        input.checksumFailures ?? 0,
        input.decodeFailures ?? 0,
        input.playbackFailures ?? 0,
        input.timestampContinuityVerified ?? null,
        input.timestampIssuesFound ? JSON.stringify(input.timestampIssuesFound) : null,
        input.storageLocation ?? null,
        input.storageAccessible ?? null,
        input.legalHoldActive ?? false,
        input.retentionPolicyMet ?? null,
        input.verificationStatus,
        input.compliancePercentage ?? null,
        input.issuesSummary ?? null,
        input.verifiedBy ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listRecordingVerificationJobs(
    tenantId: string,
    filters?: {
      cameraId?: string;
      branchNodeId?: string;
      status?: string;
      from?: string;
      to?: string;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        rv.*,
        c.name as camera_name,
        n.name as branch_name,
        u.name as verified_by_name
      FROM recording_verification_jobs rv
      LEFT JOIN cameras c ON c.id = rv.camera_id
      LEFT JOIN organizational_nodes n ON n.id = rv.branch_node_id
      LEFT JOIN users u ON u.id = rv.verified_by
      WHERE rv.tenant_id = $1
        AND ($2::uuid IS NULL OR rv.camera_id = $2)
        AND ($3::uuid IS NULL OR rv.branch_node_id = $3)
        AND ($4::text IS NULL OR rv.verification_status = $4)
        AND ($5::date IS NULL OR rv.verification_date >= $5)
        AND ($6::date IS NULL OR rv.verification_date <= $6)
      ORDER BY rv.verification_date DESC, rv.created_at DESC`,
      [
        tenantId,
        filters?.cameraId ?? null,
        filters?.branchNodeId ?? null,
        filters?.status ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  async getRecordingVerificationJob(id: string) {
    const result = await this.pool.query('SELECT * FROM recording_verification_jobs WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createRecordingGap(input: any) {
    const result = await this.pool.query(
      `INSERT INTO recording_gaps (
        id, tenant_id, camera_id, verification_job_id, gap_start, gap_end,
        gap_duration_seconds, gap_type, root_cause, resolution, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.cameraId,
        input.verificationJobId ?? null,
        input.gapStart,
        input.gapEnd,
        input.gapDurationSeconds,
        input.gapType ?? 'unknown',
        input.rootCause ?? null,
        input.resolution ?? null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listRecordingGaps(
    tenantId: string,
    filters?: { cameraId?: string; verificationJobId?: string; from?: string; to?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        rg.*,
        c.name as camera_name,
        rv.verification_date
      FROM recording_gaps rg
      LEFT JOIN cameras c ON c.id = rg.camera_id
      LEFT JOIN recording_verification_jobs rv ON rv.id = rg.verification_job_id
      WHERE rg.tenant_id = $1
        AND ($2::uuid IS NULL OR rg.camera_id = $2)
        AND ($3::uuid IS NULL OR rg.verification_job_id = $3)
        AND ($4::timestamptz IS NULL OR rg.gap_start >= $4)
        AND ($5::timestamptz IS NULL OR rg.gap_end <= $5)
      ORDER BY rg.gap_start DESC`,
      [
        tenantId,
        filters?.cameraId ?? null,
        filters?.verificationJobId ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  // ============================================================================
  // STORAGE HEALTH CHECKS
  // ============================================================================

  async createStorageHealthCheck(input: any) {
    const result = await this.pool.query(
      `INSERT INTO storage_health_checks (
        id, tenant_id, storage_node_id, branch_node_id, check_timestamp,
        storage_node_name, storage_type, total_capacity_gb, used_capacity_gb,
        free_capacity_gb, utilization_percentage, hot_storage_gb, warm_storage_gb,
        cold_storage_gb, cameras_allocated, estimated_days_until_full,
        write_throughput_mbps, read_throughput_mbps, iops, average_latency_ms,
        raid_status, raid_level, failed_disks, degraded_arrays, rebuild_in_progress,
        rebuild_percentage, object_storage_available, replication_lag_seconds,
        write_failures_24h, read_failures_24h, orphaned_files, backup_configured,
        last_backup_time, backup_status, cleanup_job_running, files_pending_deletion,
        overall_status, health_score, alerts_triggered, recommendations, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38, $39, $40, $41, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.storageNodeId ?? null,
        input.branchNodeId ?? null,
        input.checkTimestamp ?? new Date().toISOString(),
        input.storageNodeName,
        input.storageType ?? null,
        input.totalCapacityGb ?? null,
        input.usedCapacityGb ?? null,
        input.freeCapacityGb ?? null,
        input.utilizationPercentage ?? null,
        input.hotStorageGb ?? null,
        input.warmStorageGb ?? null,
        input.coldStorageGb ?? null,
        input.camerasAllocated ?? null,
        input.estimatedDaysUntilFull ?? null,
        input.writeThroughputMbps ?? null,
        input.readThroughputMbps ?? null,
        input.iops ?? null,
        input.averageLatencyMs ?? null,
        input.raidStatus ?? null,
        input.raidLevel ?? null,
        input.failedDisks ?? 0,
        input.degradedArrays ?? 0,
        input.rebuildInProgress ?? false,
        input.rebuildPercentage ?? null,
        input.objectStorageAvailable ?? null,
        input.replicationLagSeconds ?? null,
        input.writeFailures24h ?? 0,
        input.readFailures24h ?? 0,
        input.orphanedFiles ?? 0,
        input.backupConfigured ?? null,
        input.lastBackupTime ?? null,
        input.backupStatus ?? null,
        input.cleanupJobRunning ?? false,
        input.filesPendingDeletion ?? 0,
        input.overallStatus,
        input.healthScore ?? null,
        input.alertsTriggered ? JSON.stringify(input.alertsTriggered) : null,
        input.recommendations ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listStorageHealthChecks(
    tenantId: string,
    filters?: {
      storageNodeId?: string;
      branchNodeId?: string;
      status?: string;
      from?: string;
      to?: string;
      minUtilization?: number;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        sh.*,
        n.name as branch_name
      FROM storage_health_checks sh
      LEFT JOIN organizational_nodes n ON n.id = sh.branch_node_id
      WHERE sh.tenant_id = $1
        AND ($2::uuid IS NULL OR sh.storage_node_id = $2)
        AND ($3::uuid IS NULL OR sh.branch_node_id = $3)
        AND ($4::text IS NULL OR sh.overall_status = $4)
        AND ($5::timestamptz IS NULL OR sh.check_timestamp >= $5)
        AND ($6::timestamptz IS NULL OR sh.check_timestamp <= $6)
        AND ($7::numeric IS NULL OR sh.utilization_percentage >= $7)
      ORDER BY sh.check_timestamp DESC`,
      [
        tenantId,
        filters?.storageNodeId ?? null,
        filters?.branchNodeId ?? null,
        filters?.status ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.minUtilization ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  async getStorageHealthCheck(id: string) {
    const result = await this.pool.query('SELECT * FROM storage_health_checks WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async getStorageHealthSummary(tenantId: string, branchNodeId?: string) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(DISTINCT storage_node_id) as total_storage_nodes,
        SUM(total_capacity_gb) as total_capacity_gb,
        SUM(used_capacity_gb) as used_capacity_gb,
        SUM(free_capacity_gb) as free_capacity_gb,
        AVG(utilization_percentage) as avg_utilization,
        MIN(estimated_days_until_full) as min_days_until_full,
        COUNT(*) FILTER (WHERE overall_status = 'critical') as critical_nodes,
        COUNT(*) FILTER (WHERE utilization_percentage >= 90) as over_90_percent,
        SUM(failed_disks) as total_failed_disks
      FROM (
        SELECT DISTINCT ON (storage_node_id)
          storage_node_id, total_capacity_gb, used_capacity_gb, free_capacity_gb,
          utilization_percentage, estimated_days_until_full, overall_status, failed_disks
        FROM storage_health_checks
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR branch_node_id = $2)
        ORDER BY storage_node_id, check_timestamp DESC
      ) latest`,
      [tenantId, branchNodeId ?? null]
    );
    return camelRow(result.rows[0]);
  }

  // ============================================================================
  // MAINTENANCE WORK ORDERS
  // ============================================================================

  async createMaintenanceWorkOrder(input: any) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_work_orders (
        id, tenant_id, work_order_number, camera_id, infrastructure_node_id, branch_node_id,
        work_type, priority, title, reported_problem, root_cause, reported_date, reported_by,
        scheduled_date, scheduled_time_start, scheduled_time_end, assigned_technician_id,
        assigned_technician_name, vendor_name, vendor_contact, visit_date, work_start_time,
        work_end_time, downtime_minutes, work_performed, parts_replaced, before_images,
        after_images, testing_performed, testing_result, recording_verified, quality_verified,
        status, completed_by, completed_at, closed_by, closed_at, closure_notes,
        approved_by, approved_at, approval_notes, next_maintenance_date, follow_up_required,
        follow_up_notes, labor_cost, parts_cost, travel_cost, total_cost, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
        $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.workOrderNumber,
        input.cameraId ?? null,
        input.infrastructureNodeId ?? null,
        input.branchNodeId ?? null,
        input.workType,
        input.priority ?? 'normal',
        input.title,
        input.reportedProblem ?? null,
        input.rootCause ?? null,
        input.reportedDate ?? new Date().toISOString(),
        input.reportedBy ?? null,
        input.scheduledDate ?? null,
        input.scheduledTimeStart ?? null,
        input.scheduledTimeEnd ?? null,
        input.assignedTechnicianId ?? null,
        input.assignedTechnicianName ?? null,
        input.vendorName ?? null,
        input.vendorContact ?? null,
        input.visitDate ?? null,
        input.workStartTime ?? null,
        input.workEndTime ?? null,
        input.downtimeMinutes ?? null,
        input.workPerformed ?? null,
        input.partsReplaced ? JSON.stringify(input.partsReplaced) : null,
        input.beforeImages ? JSON.stringify(input.beforeImages) : null,
        input.afterImages ? JSON.stringify(input.afterImages) : null,
        input.testingPerformed ?? null,
        input.testingResult ?? null,
        input.recordingVerified ?? null,
        input.qualityVerified ?? null,
        input.status ?? 'open',
        input.completedBy ?? null,
        input.completedAt ?? null,
        input.closedBy ?? null,
        input.closedAt ?? null,
        input.closureNotes ?? null,
        input.approvedBy ?? null,
        input.approvedAt ?? null,
        input.approvalNotes ?? null,
        input.nextMaintenanceDate ?? null,
        input.followUpRequired ?? false,
        input.followUpNotes ?? null,
        input.laborCost ?? null,
        input.partsCost ?? null,
        input.travelCost ?? null,
        input.totalCost ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listMaintenanceWorkOrders(
    tenantId: string,
    filters?: {
      cameraId?: string;
      branchNodeId?: string;
      status?: string;
      priority?: string;
      workType?: string;
      assignedTechnicianId?: string;
      from?: string;
      to?: string;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        mw.*,
        c.name as camera_name,
        n.name as branch_name,
        u1.name as reported_by_name,
        u2.name as assigned_technician_name_user,
        u3.name as completed_by_name
      FROM maintenance_work_orders mw
      LEFT JOIN cameras c ON c.id = mw.camera_id
      LEFT JOIN organizational_nodes n ON n.id = mw.branch_node_id
      LEFT JOIN users u1 ON u1.id = mw.reported_by
      LEFT JOIN users u2 ON u2.id = mw.assigned_technician_id
      LEFT JOIN users u3 ON u3.id = mw.completed_by
      WHERE mw.tenant_id = $1
        AND ($2::uuid IS NULL OR mw.camera_id = $2)
        AND ($3::uuid IS NULL OR mw.branch_node_id = $3)
        AND ($4::text IS NULL OR mw.status = $4)
        AND ($5::text IS NULL OR mw.priority = $5)
        AND ($6::text IS NULL OR mw.work_type = $6)
        AND ($7::uuid IS NULL OR mw.assigned_technician_id = $7)
        AND ($8::date IS NULL OR mw.reported_date >= $8)
        AND ($9::date IS NULL OR mw.reported_date <= $9)
      ORDER BY 
        CASE mw.priority
          WHEN 'emergency' THEN 1
          WHEN 'urgent' THEN 2
          WHEN 'high' THEN 3
          WHEN 'normal' THEN 4
          ELSE 5
        END,
        mw.scheduled_date NULLS LAST,
        mw.created_at DESC`,
      [
        tenantId,
        filters?.cameraId ?? null,
        filters?.branchNodeId ?? null,
        filters?.status ?? null,
        filters?.priority ?? null,
        filters?.workType ?? null,
        filters?.assignedTechnicianId ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  async getMaintenanceWorkOrder(id: string) {
    const result = await this.pool.query('SELECT * FROM maintenance_work_orders WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async updateMaintenanceWorkOrder(id: string, input: any) {
    const values: Record<string, unknown> = {
      work_order_number: input.workOrderNumber,
      camera_id: input.cameraId,
      infrastructure_node_id: input.infrastructureNodeId,
      branch_node_id: input.branchNodeId,
      work_type: input.workType,
      priority: input.priority,
      title: input.title,
      reported_problem: input.reportedProblem,
      root_cause: input.rootCause,
      reported_date: input.reportedDate,
      reported_by: input.reportedBy,
      scheduled_date: input.scheduledDate,
      scheduled_time_start: input.scheduledTimeStart,
      scheduled_time_end: input.scheduledTimeEnd,
      assigned_technician_id: input.assignedTechnicianId,
      assigned_technician_name: input.assignedTechnicianName,
      vendor_name: input.vendorName,
      vendor_contact: input.vendorContact,
      visit_date: input.visitDate,
      work_start_time: input.workStartTime,
      work_end_time: input.workEndTime,
      downtime_minutes: input.downtimeMinutes,
      work_performed: input.workPerformed,
      parts_replaced: input.partsReplaced ? JSON.stringify(input.partsReplaced) : undefined,
      before_images: input.beforeImages ? JSON.stringify(input.beforeImages) : undefined,
      after_images: input.afterImages ? JSON.stringify(input.afterImages) : undefined,
      testing_performed: input.testingPerformed,
      testing_result: input.testingResult,
      recording_verified: input.recordingVerified,
      quality_verified: input.qualityVerified,
      status: input.status,
      next_maintenance_date: input.nextMaintenanceDate,
      follow_up_required: input.followUpRequired,
      follow_up_notes: input.followUpNotes,
      labor_cost: input.laborCost,
      parts_cost: input.partsCost,
      travel_cost: input.travelCost,
      total_cost: input.totalCost,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getMaintenanceWorkOrder(id);

    const result = await this.pool.query(
      `UPDATE maintenance_work_orders SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async completeMaintenanceWorkOrder(id: string, input: { completedBy: string; workPerformed?: string; testingResult?: string }) {
    const result = await this.pool.query(
      `UPDATE maintenance_work_orders 
      SET 
        status = 'completed',
        completed_by = $1,
        completed_at = now(),
        work_performed = COALESCE($2, work_performed),
        testing_result = COALESCE($3, testing_result),
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [input.completedBy, input.workPerformed ?? null, input.testingResult ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async approveMaintenanceWorkOrder(id: string, input: { approvedBy: string; approvalNotes?: string }) {
    const result = await this.pool.query(
      `UPDATE maintenance_work_orders 
      SET 
        approved_by = $1,
        approved_at = now(),
        approval_notes = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [input.approvedBy, input.approvalNotes ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async closeMaintenanceWorkOrder(id: string, input: { closedBy: string; closureNotes?: string }) {
    const result = await this.pool.query(
      `UPDATE maintenance_work_orders 
      SET 
        status = 'closed',
        closed_by = $1,
        closed_at = now(),
        closure_notes = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [input.closedBy, input.closureNotes ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async getMaintenanceSummary(tenantId: string, branchNodeId?: string) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total_work_orders,
        COUNT(*) FILTER (WHERE status = 'open') as open_orders,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_orders,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_orders,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE priority IN ('urgent', 'emergency')) as urgent_orders,
        COUNT(*) FILTER (WHERE scheduled_date < CURRENT_DATE AND status NOT IN ('completed', 'closed', 'cancelled')) as overdue_orders,
        AVG(downtime_minutes) FILTER (WHERE downtime_minutes IS NOT NULL) as avg_downtime_minutes,
        SUM(total_cost) as total_maintenance_cost
      FROM maintenance_work_orders
      WHERE tenant_id = $1
        AND ($2::uuid IS NULL OR branch_node_id = $2)
        AND created_at >= CURRENT_DATE - INTERVAL '90 days'`,
      [tenantId, branchNodeId ?? null]
    );
    return camelRow(result.rows[0]);
  }

  // ============================================================================
  // VIDEO ACCESS LOGS
  // ============================================================================

  async createVideoAccessLog(input: any) {
    const result = await this.pool.query(
      `INSERT INTO video_access_logs (
        id, tenant_id, access_timestamp, session_id, correlation_id, user_id, user_name,
        user_role, user_department, access_type, camera_id, camera_name, branch_node_id,
        branch_name, playback_start_time, playback_end_time, duration_seconds,
        search_criteria, export_format, export_size_bytes, export_path, watermarked,
        shared_with, share_expiry, external_access, authorized_by, authorization_reason,
        incident_id, evidence_id, access_reason, case_reference, source_ip, user_agent,
        device_id, location_accessed_from, access_result, denial_reason, error_message,
        sensitive_content, privacy_compliant, retention_policy_verified, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
        $35, $36, $37, $38, $39, $40, $41, $42, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.accessTimestamp ?? new Date().toISOString(),
        input.sessionId ?? null,
        input.correlationId ?? null,
        input.userId ?? null,
        input.userName,
        input.userRole ?? null,
        input.userDepartment ?? null,
        input.accessType,
        input.cameraId ?? null,
        input.cameraName ?? null,
        input.branchNodeId ?? null,
        input.branchName ?? null,
        input.playbackStartTime ?? null,
        input.playbackEndTime ?? null,
        input.durationSeconds ?? null,
        input.searchCriteria ? JSON.stringify(input.searchCriteria) : null,
        input.exportFormat ?? null,
        input.exportSizeBytes ?? null,
        input.exportPath ?? null,
        input.watermarked ?? null,
        input.sharedWith ? JSON.stringify(input.sharedWith) : null,
        input.shareExpiry ?? null,
        input.externalAccess ?? false,
        input.authorizedBy ?? null,
        input.authorizationReason ?? null,
        input.incidentId ?? null,
        input.evidenceId ?? null,
        input.accessReason ?? null,
        input.caseReference ?? null,
        input.sourceIp,
        input.userAgent ?? null,
        input.deviceId ?? null,
        input.locationAccessedFrom ?? null,
        input.accessResult ?? 'success',
        input.denialReason ?? null,
        input.errorMessage ?? null,
        input.sensitiveContent ?? false,
        input.privacyCompliant ?? true,
        input.retentionPolicyVerified ?? false,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async listVideoAccessLogs(
    tenantId: string,
    filters?: {
      userId?: string;
      cameraId?: string;
      branchNodeId?: string;
      accessType?: string;
      incidentId?: string;
      sessionId?: string;
      from?: string;
      to?: string;
      limit?: number;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        val.*
      FROM video_access_logs val
      WHERE val.tenant_id = $1
        AND ($2::uuid IS NULL OR val.user_id = $2)
        AND ($3::uuid IS NULL OR val.camera_id = $3)
        AND ($4::uuid IS NULL OR val.branch_node_id = $4)
        AND ($5::text IS NULL OR val.access_type = $5)
        AND ($6::uuid IS NULL OR val.incident_id = $6)
        AND ($7::uuid IS NULL OR val.session_id = $7)
        AND ($8::timestamptz IS NULL OR val.access_timestamp >= $8)
        AND ($9::timestamptz IS NULL OR val.access_timestamp <= $9)
      ORDER BY val.access_timestamp DESC
      LIMIT $10`,
      [
        tenantId,
        filters?.userId ?? null,
        filters?.cameraId ?? null,
        filters?.branchNodeId ?? null,
        filters?.accessType ?? null,
        filters?.incidentId ?? null,
        filters?.sessionId ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.limit ?? 100,
      ]
    );
    return camelRows(result.rows);
  }

  async getVideoAccessLog(id: string) {
    const result = await this.pool.query('SELECT * FROM video_access_logs WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async getVideoAccessSummary(
    tenantId: string,
    filters?: { userId?: string; from?: string; to?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT camera_id) as cameras_accessed,
        COUNT(*) FILTER (WHERE access_type = 'live_view') as live_views,
        COUNT(*) FILTER (WHERE access_type = 'playback') as playbacks,
        COUNT(*) FILTER (WHERE access_type = 'download') as downloads,
        COUNT(*) FILTER (WHERE access_type = 'export') as exports,
        COUNT(*) FILTER (WHERE external_access = true) as external_accesses,
        COUNT(*) FILTER (WHERE access_result = 'denied') as denied_accesses,
        SUM(duration_seconds) as total_viewing_seconds,
        SUM(export_size_bytes) as total_export_bytes
      FROM video_access_logs
      WHERE tenant_id = $1
        AND ($2::uuid IS NULL OR user_id = $2)
        AND ($3::timestamptz IS NULL OR access_timestamp >= $3)
        AND ($4::timestamptz IS NULL OR access_timestamp <= $4)`,
      [tenantId, filters?.userId ?? null, filters?.from ?? null, filters?.to ?? null]
    );
    return camelRow(result.rows[0]);
  }

  // ============================================================================
  // COMPLIANCE CERTIFICATE VERIFICATIONS
  // ============================================================================

  async createCertificateVerification(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_certificate_verifications (
        id, certificate_id, verification_code, qr_code_url, issued_at,
        revoked, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.certificateId,
        input.verificationCode,
        input.qrCodeUrl ?? null,
        input.issuedAt ?? new Date().toISOString(),
        input.revoked ?? false,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async verifyCertificateByCode(verificationCode: string) {
    const result = await this.pool.query(
      `UPDATE compliance_certificate_verifications 
      SET 
        verification_count = verification_count + 1,
        last_verified_at = now()
      WHERE verification_code = $1 AND revoked = false
      RETURNING *`,
      [verificationCode]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async revokeCertificateVerification(id: string, input: { revokedBy: string; revocationReason: string }) {
    const result = await this.pool.query(
      `UPDATE compliance_certificate_verifications 
      SET 
        revoked = true,
        revoked_at = now(),
        revoked_by = $1,
        revocation_reason = $2
      WHERE id = $3
      RETURNING *`,
      [input.revokedBy, input.revocationReason, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // ============================================================================
  // COMPLIANCE JOB EXECUTIONS
  // ============================================================================

  async createComplianceJobExecution(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_job_executions (
        id, tenant_id, job_type, job_name, started_at, status, branch_node_ids,
        camera_ids, items_processed, items_succeeded, items_failed, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.jobType,
        input.jobName,
        input.startedAt ?? new Date().toISOString(),
        input.status ?? 'running',
        input.branchNodeIds ? JSON.stringify(input.branchNodeIds) : null,
        input.cameraIds ? JSON.stringify(input.cameraIds) : null,
        input.itemsProcessed ?? 0,
        input.itemsSucceeded ?? 0,
        input.itemsFailed ?? 0,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async updateComplianceJobExecution(id: string, input: any) {
    const values: Record<string, unknown> = {
      status: input.status,
      completed_at: input.completedAt,
      duration_seconds: input.durationSeconds,
      items_processed: input.itemsProcessed,
      items_succeeded: input.itemsSucceeded,
      items_failed: input.itemsFailed,
      error_message: input.errorMessage,
      error_details: input.errorDetails ? JSON.stringify(input.errorDetails) : undefined,
      result_summary: input.resultSummary ? JSON.stringify(input.resultSummary) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceJobExecution(id);

    const result = await this.pool.query(
      `UPDATE compliance_job_executions SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async getComplianceJobExecution(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_job_executions WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async listComplianceJobExecutions(
    tenantId: string,
    filters?: { jobType?: string; status?: string; from?: string; to?: string; limit?: number }
  ) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_job_executions
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR job_type = $2)
        AND ($3::text IS NULL OR status = $3)
        AND ($4::timestamptz IS NULL OR started_at >= $4)
        AND ($5::timestamptz IS NULL OR started_at <= $5)
      ORDER BY started_at DESC
      LIMIT $6`,
      [
        tenantId,
        filters?.jobType ?? null,
        filters?.status ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.limit ?? 50,
      ]
    );
    return camelRows(result.rows);
  }

  // ============================================================================
  // BRANCH COMPLIANCE SUMMARY
  // ============================================================================

  async getBranchComplianceSummary(tenantId: string, branchNodeId?: string) {
    const result = await this.pool.query(
      `SELECT * FROM branch_compliance_summary
      WHERE tenant_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
      ORDER BY overall_compliance_score DESC, branch_name`,
      [tenantId, branchNodeId ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceMetricsDaily(
    tenantId: string,
    filters?: { from?: string; to?: string }
  ) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_metrics_daily
      WHERE tenant_id = $1
        AND ($2::date IS NULL OR metric_date >= $2)
        AND ($3::date IS NULL OR metric_date <= $3)
      ORDER BY metric_date DESC`,
      [tenantId, filters?.from ?? null, filters?.to ?? null]
    );
    return camelRows(result.rows);
  }

  // ============================================================================
  // COMPREHENSIVE AUDIT REPORT
  // ============================================================================

  async getComprehensiveAuditReport(
    tenantId: string,
    branchNodeId: string,
    reportPeriodStart: string,
    reportPeriodEnd: string
  ) {
    // Camera health summary
    const healthSummary = await this.pool.query(
      `SELECT 
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT chc.camera_id) FILTER (WHERE chc.is_online = true) as online_cameras,
        COUNT(DISTINCT chc.camera_id) FILTER (WHERE chc.is_recording = true) as recording_cameras,
        AVG(chc.health_score) as avg_health_score,
        COUNT(DISTINCT chc.id) FILTER (WHERE chc.overall_status = 'critical') as critical_health_checks
      FROM cameras c
      LEFT JOIN camera_health_checks chc ON chc.camera_id = c.id 
        AND chc.check_timestamp BETWEEN $3 AND $4
      WHERE c.tenant_id = $1 AND c.branch_node_id = $2`,
      [tenantId, branchNodeId, reportPeriodStart, reportPeriodEnd]
    );

    // Recording verification summary
    const recordingSummary = await this.pool.query(
      `SELECT 
        COUNT(*) as total_verifications,
        AVG(recording_availability_percentage) as avg_availability,
        COUNT(*) FILTER (WHERE verification_status = 'compliant') as compliant_verifications,
        COUNT(*) FILTER (WHERE verification_status = 'non_compliant') as non_compliant_verifications,
        SUM(total_gaps) as total_recording_gaps
      FROM recording_verification_jobs
      WHERE tenant_id = $1 AND branch_node_id = $2
        AND verification_date BETWEEN $3 AND $4`,
      [tenantId, branchNodeId, reportPeriodStart, reportPeriodEnd]
    );

    // Storage summary
    const storageSummary = await this.pool.query(
      `SELECT 
        AVG(utilization_percentage) as avg_utilization,
        MIN(estimated_days_until_full) as min_days_until_full,
        COUNT(*) FILTER (WHERE overall_status = 'critical') as critical_storage_checks
      FROM storage_health_checks
      WHERE tenant_id = $1 AND branch_node_id = $2
        AND check_timestamp BETWEEN $3 AND $4`,
      [tenantId, branchNodeId, reportPeriodStart, reportPeriodEnd]
    );

    // Maintenance summary
    const maintenanceSummary = await this.pool.query(
      `SELECT 
        COUNT(*) as total_work_orders,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE priority IN ('urgent', 'emergency')) as urgent_orders,
        AVG(downtime_minutes) as avg_downtime_minutes
      FROM maintenance_work_orders
      WHERE tenant_id = $1 AND branch_node_id = $2
        AND reported_date BETWEEN $3 AND $4`,
      [tenantId, branchNodeId, reportPeriodStart, reportPeriodEnd]
    );

    // Video access summary
    const accessSummary = await this.pool.query(
      `SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE access_type = 'export') as exports,
        COUNT(*) FILTER (WHERE access_result = 'denied') as denied_accesses
      FROM video_access_logs
      WHERE tenant_id = $1 AND branch_node_id = $2
        AND access_timestamp BETWEEN $3 AND $4`,
      [tenantId, branchNodeId, reportPeriodStart, reportPeriodEnd]
    );

    return {
      health: camelRow(healthSummary.rows[0]),
      recording: camelRow(recordingSummary.rows[0]),
      storage: camelRow(storageSummary.rows[0]),
      maintenance: camelRow(maintenanceSummary.rows[0]),
      access: camelRow(accessSummary.rows[0]),
    };
  }
}
