import { Pool } from 'pg';
import { ComplianceService } from './compliance-service.js';
import { AuditRepository } from '../database/audit-repository.js';

type TelemetryAuditRow = {
  tenant_id: string;
  branch_node_id: string;
  device_id: string;
  observed_at: Date;
  received_at: Date;
  source: string;
  quality: string;
  idempotency_key: string;
  metrics: Record<string, unknown> | null;
  reason_codes: string[] | null;
};

const CAMERA_TELEMETRY_MAX_AGE_MS = 10 * 60 * 1000;
const STORAGE_TELEMETRY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function metricNumber(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metricBoolean(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === 'boolean' ? value : undefined;
}

function metricString(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function telemetryMetadata(row: TelemetryAuditRow) {
  return {
    telemetryIdempotencyKey: row.idempotency_key,
    telemetrySource: row.source,
    telemetryQuality: row.quality,
    telemetryObservedAt: row.observed_at.toISOString(),
    telemetryReceivedAt: row.received_at.toISOString(),
    reasonCodes: row.reason_codes ?? [],
  };
}

export function cameraHealthAuditFromTelemetry(row: TelemetryAuditRow, now = new Date()) {
  if (!['verified', 'estimated'].includes(row.quality)) return null;
  if (now.getTime() - row.observed_at.getTime() > CAMERA_TELEMETRY_MAX_AGE_MS) return null;

  const metrics = row.metrics ?? {};
  const status = metricString(metrics, 'status');
  const streamActive = metricBoolean(metrics, 'streamActive');
  const isOnline = status === 'online' || status === 'degraded' || streamActive === true;
  const isOffline = status === 'offline' || streamActive === false;
  const videoLoss = metricBoolean(metrics, 'videoLoss');
  const frozenImage = metricBoolean(metrics, 'imageFrozen');
  const blackImage = metricBoolean(metrics, 'blackScreen');
  const blurredImage = metricBoolean(metrics, 'severeBlur');
  const obstructed = metricBoolean(metrics, 'obstructionSuspected');
  const tamperingDetected = metricBoolean(metrics, 'cameraMovementSuspected');
  const latencyMs = metricNumber(metrics, 'responseTimeMs') ?? metricNumber(metrics, 'latencyMs');
  const packetLossPercentage = metricNumber(metrics, 'packetLossPercent');

  let overallStatus: 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline' | 'unknown' = 'unknown';
  if (isOffline) overallStatus = 'offline';
  else if (isOnline && (videoLoss || frozenImage || blackImage || tamperingDetected)) overallStatus = 'critical';
  else if (isOnline && (blurredImage || obstructed || status === 'degraded')) overallStatus = 'degraded';
  else if (isOnline && ((latencyMs ?? 0) > 200 || (packetLossPercentage ?? 0) > 5)) overallStatus = 'warning';
  else if (isOnline) overallStatus = 'healthy';

  const issues = new Set(row.reason_codes ?? []);
  if (isOffline) issues.add('camera_offline');
  if (videoLoss) issues.add('video_loss');
  if (frozenImage) issues.add('image_frozen');
  if (blackImage) issues.add('black_screen');
  if (blurredImage) issues.add('severe_blur');
  if (obstructed) issues.add('obstruction_suspected');
  if (tamperingDetected) issues.add('camera_movement_suspected');

  return {
    tenantId: row.tenant_id,
    cameraId: row.device_id,
    branchNodeId: row.branch_node_id,
    checkTimestamp: row.observed_at.toISOString(),
    isOnline,
    rtspAvailable: streamActive,
    latencyMs,
    packetLossPercentage,
    currentFps: metricNumber(metrics, 'fps'),
    currentBitrateKbps: metricNumber(metrics, 'bitrateKbps'),
    resolutionWidth: metricNumber(metrics, 'width'),
    resolutionHeight: metricNumber(metrics, 'height'),
    videoLoss,
    frozenImage,
    blackImage,
    blurredImage,
    obstructed,
    tamperingDetected,
    isRecording: metricBoolean(metrics, 'isRecording'),
    healthScore: metricNumber(metrics, 'healthScore'),
    overallStatus,
    issuesDetected: [...issues],
    alertGenerated: ['critical', 'offline'].includes(overallStatus),
    metadata: telemetryMetadata(row),
  };
}

export function storageHealthAuditFromTelemetry(row: TelemetryAuditRow, now = new Date()) {
  if (!['verified', 'estimated'].includes(row.quality)) return null;
  if (now.getTime() - row.observed_at.getTime() > STORAGE_TELEMETRY_MAX_AGE_MS) return null;

  const metrics = row.metrics ?? {};
  const reportedStatus = metricString(metrics, 'operationalStatus') ?? metricString(metrics, 'status');
  if (!reportedStatus || reportedStatus === 'unknown') return null;
  const overallStatus = reportedStatus === 'healthy'
    ? 'healthy'
    : reportedStatus === 'warning' ? 'warning' : reportedStatus === 'failed' ? 'failed' : 'critical';
  const bytesToGb = (value: number | undefined) => value && value > 0
    ? Math.round((value / (1024 ** 3)) * 100) / 100
    : undefined;
  const detected = metricBoolean(metrics, 'detected');
  const raidFailedMembers = metricNumber(metrics, 'raidFailedMemberCount');
  const alerts = new Set(row.reason_codes ?? []);
  if (overallStatus !== 'healthy' && alerts.size === 0) alerts.add(`disk_${overallStatus}`);

  return {
    tenantId: row.tenant_id,
    storageNodeId: null,
    branchNodeId: row.branch_node_id,
    checkTimestamp: row.observed_at.toISOString(),
    storageNodeName: metricString(metrics, 'model') ?? metricString(metrics, 'devicePath') ?? row.device_id,
    storageType: 'local',
    totalCapacityGb: bytesToGb(metricNumber(metrics, 'capacityBytes')),
    usedCapacityGb: bytesToGb(metricNumber(metrics, 'usedBytes')),
    freeCapacityGb: bytesToGb(metricNumber(metrics, 'availableBytes')),
    utilizationPercentage: metricNumber(metrics, 'usagePercent'),
    averageLatencyMs: metricNumber(metrics, 'writeLatencyMs'),
    raidStatus: metricString(metrics, 'raidStatus'),
    raidLevel: metricString(metrics, 'raidLevel'),
    failedDisks: raidFailedMembers ?? (detected === false ? 1 : 0),
    rebuildInProgress: (metricNumber(metrics, 'raidRebuildPercent') ?? 0) > 0,
    rebuildPercentage: metricNumber(metrics, 'raidRebuildPercent'),
    overallStatus,
    healthScore: metricNumber(metrics, 'healthScore'),
    alertsTriggered: [...alerts],
    metadata: telemetryMetadata(row),
  };
}

export function recordingVerificationFromArchiveTelemetry(
  row: TelemetryAuditRow,
  cameraId: string,
  verificationPeriodStart: Date,
  verificationPeriodEnd: Date,
) {
  if (!['verified', 'estimated'].includes(row.quality)) return null;
  const metrics = row.metrics ?? {};
  const archiveStatus = metricString(metrics, 'archiveStatus');
  if (!archiveStatus) return null;
  const coverageComplete = metricBoolean(metrics, 'coverageComplete');
  const playbackVerified = metricBoolean(metrics, 'playbackVerified');
  const gapCount = metricNumber(metrics, 'gapCount');
  const largestGapSeconds = metricNumber(metrics, 'largestGapSeconds');
  const compliant = archiveStatus === 'available' && coverageComplete === true
    && (gapCount ?? 0) === 0 && playbackVerified !== false;
  const unavailable = archiveStatus === 'unavailable' || archiveStatus === 'empty';
  const verificationStatus = compliant
    ? 'compliant'
    : unavailable ? 'non_compliant' : archiveStatus === 'available' ? 'partially_compliant' : 'not_assessed';

  return {
    tenantId: row.tenant_id,
    cameraId,
    branchNodeId: row.branch_node_id,
    verificationDate: verificationPeriodStart.toISOString().slice(0, 10),
    verificationPeriodStart: verificationPeriodStart.toISOString(),
    verificationPeriodEnd: verificationPeriodEnd.toISOString(),
    expectedDurationSeconds: Math.round((verificationPeriodEnd.getTime() - verificationPeriodStart.getTime()) / 1000),
    totalGaps: gapCount,
    largestGapSeconds,
    timestampContinuityVerified: coverageComplete === undefined ? undefined : coverageComplete && (gapCount ?? 0) === 0,
    storageAccessible: archiveStatus === 'available',
    playbackFailures: playbackVerified === undefined ? undefined : playbackVerified ? 0 : 1,
    verificationStatus,
    compliancePercentage: compliant ? 100 : undefined,
    issuesSummary: compliant ? undefined : [...new Set(row.reason_codes ?? [])].join(', ') || `archive_${archiveStatus}`,
    metadata: telemetryMetadata(row),
  };
}

/**
 * Scheduler Service - Manages automated compliance and audit jobs
 */
export class SchedulerService {
  private complianceService: ComplianceService;
  private auditRepo: AuditRepository;
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly pool: Pool) {
    this.complianceService = new ComplianceService(pool);
    this.auditRepo = new AuditRepository(pool);
  }

  /**
   * Initialize all scheduled jobs
   */
  start() {
    console.log('Starting Compliance Scheduler Service...');

    // Health Monitoring Jobs
    this.scheduleJob('camera-health-check', 5 * 60 * 1000, () => this.runCameraHealthChecks());
    this.scheduleJob('storage-health-check', 30 * 60 * 1000, () => this.runStorageHealthChecks());
    this.scheduleJob('refresh-health-views', 10 * 60 * 1000, () => this.refreshHealthViews());

    // Recording Verification Jobs (run at 00:30 daily)
    this.scheduleDailyJob('daily-recording-verification', '00:30', () => this.runDailyRecordingVerification());

    // Compliance Assessment Jobs
    this.scheduleMonthlyJob('monthly-compliance-assessment', 1, '01:00', () => this.runMonthlyComplianceAssessment());

    // Maintenance Jobs
    this.scheduleDailyJob('overdue-maintenance-alert', '08:00', () => this.checkOverdueMaintenance());

    // Certificate Jobs
    this.scheduleWeeklyJob('certificate-expiry-alert', 'monday', '09:00', () => this.checkCertificateExpiry());

    // Audit Jobs
    this.scheduleDailyJob('access-log-analysis', '23:00', () => this.analyzeAccessLogs());

    console.log(`Scheduler Service started with ${this.scheduledJobs.size} jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('Stopping Scheduler Service...');
    this.scheduledJobs.forEach((timeout, jobName) => {
      clearTimeout(timeout);
      console.log(`Stopped job: ${jobName}`);
    });
    this.scheduledJobs.clear();
  }

  /**
   * Schedule a job to run at regular intervals
   */
  private scheduleJob(jobName: string, intervalMs: number, handler: () => Promise<void>) {
    const runJob = async () => {
      try {
        console.log(`Running job: ${jobName}`);
        await handler();
        console.log(`Completed job: ${jobName}`);
      } catch (error) {
        console.error(`Error in job ${jobName}:`, error);
      } finally {
        // Reschedule
        const timeout = setTimeout(runJob, intervalMs);
        this.scheduledJobs.set(jobName, timeout);
      }
    };

    // Run immediately and schedule next
    runJob();
  }

  /**
   * Schedule a job to run daily at specific time
   */
  private scheduleDailyJob(jobName: string, time: string, handler: () => Promise<void>) {
    const [hours, minutes] = time.split(':').map(Number);
    
    const getNextRun = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next.getTime() - now.getTime();
    };

    const runJob = async () => {
      try {
        console.log(`Running daily job: ${jobName}`);
        await handler();
        console.log(`Completed daily job: ${jobName}`);
      } catch (error) {
        console.error(`Error in daily job ${jobName}:`, error);
      } finally {
        // Schedule next run
        const timeout = setTimeout(runJob, getNextRun());
        this.scheduledJobs.set(jobName, timeout);
      }
    };

    // Schedule first run
    const timeout = setTimeout(runJob, getNextRun());
    this.scheduledJobs.set(jobName, timeout);
  }

  /**
   * Schedule a job to run weekly on specific day and time
   */
  private scheduleWeeklyJob(
    jobName: string,
    dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    time: string,
    handler: () => Promise<void>
  ) {
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const [hours, minutes] = time.split(':').map(Number);
    const targetDay = dayMap[dayOfWeek];

    const getNextRun = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(hours ?? 0, minutes ?? 0, 0, 0);

      const currentDay = now.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7;

      if (daysUntilTarget === 0 && next <= now) {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + daysUntilTarget);
      }

      return next.getTime() - now.getTime();
    };

    const runJob = async () => {
      try {
        console.log(`Running weekly job: ${jobName}`);
        await handler();
        console.log(`Completed weekly job: ${jobName}`);
      } catch (error) {
        console.error(`Error in weekly job ${jobName}:`, error);
      } finally {
        // Schedule next run
        const timeout = setTimeout(runJob, getNextRun());
        this.scheduledJobs.set(jobName, timeout);
      }
    };

    // Schedule first run
    const timeout = setTimeout(runJob, getNextRun());
    this.scheduledJobs.set(jobName, timeout);
  }

  /**
   * Schedule a job to run monthly on specific day and time
   */
  private scheduleMonthlyJob(jobName: string, dayOfMonth: number, time: string, handler: () => Promise<void>) {
    const [hours, minutes] = time.split(':').map(Number);

    const getNextRun = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(dayOfMonth);
      next.setHours(hours ?? 0, minutes ?? 0, 0, 0);

      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }

      return next.getTime() - now.getTime();
    };

    const runJob = async () => {
      try {
        console.log(`Running monthly job: ${jobName}`);
        await handler();
        console.log(`Completed monthly job: ${jobName}`);
      } catch (error) {
        console.error(`Error in monthly job ${jobName}:`, error);
      } finally {
        // Schedule next run
        const timeout = setTimeout(runJob, getNextRun());
        this.scheduledJobs.set(jobName, timeout);
      }
    };

    // Schedule first run
    const timeout = setTimeout(runJob, getNextRun());
    this.scheduledJobs.set(jobName, timeout);
  }

  // ============================================================================
  // JOB HANDLERS
  // ============================================================================

  /**
   * Run camera health checks for all tenants/cameras
   */
  private async runCameraHealthChecks() {
    const jobExecution = await this.auditRepo.createComplianceJobExecution({
      tenantId: 'system',
      jobType: 'camera_health_check',
      jobName: 'Automated Camera Health Check',
      startedAt: new Date().toISOString(),
      status: 'running',
    });
    
    const jobExecutionId = String(jobExecution.id);

    try {
      // Audit only fresh edge evidence. A missing probe is not a healthy camera.
      const result = await this.pool.query<TelemetryAuditRow>(
        `SELECT c.tenant_id::text, c.branch_node_id::text, c.id::text AS device_id,
                telemetry.observed_at, telemetry.received_at, telemetry.source,
                telemetry.quality, telemetry.idempotency_key, telemetry.metrics,
                telemetry.reason_codes
         FROM cameras c
         JOIN LATERAL (
           SELECT observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
           FROM operational_health_telemetry
           WHERE tenant_id = c.tenant_id
             AND branch_id = c.branch_node_id
             AND device_type = 'camera'
             AND device_id = c.id::text
           ORDER BY observed_at DESC, received_at DESC
           LIMIT 1
         ) telemetry ON true
         WHERE c.approval_status = 'approved'
           AND telemetry.observed_at >= now() - interval '10 minutes'
           AND NOT EXISTS (
             SELECT 1 FROM camera_health_checks checks
             WHERE checks.camera_id = c.id
               AND checks.metadata->>'telemetryIdempotencyKey' = telemetry.idempotency_key
           )`
      );

      const cameras = result.rows;
      let succeeded = 0;
      let failed = 0;
      let notAssessed = 0;

      for (const camera of cameras) {
        try {
          const input = cameraHealthAuditFromTelemetry(camera);
          if (!input) {
            notAssessed++;
            continue;
          }
          await this.auditRepo.createCameraHealthCheck(input);
          succeeded++;
        } catch (error) {
          console.error(`Health audit failed for camera ${camera.device_id}:`, error);
          failed++;
        }
      }

      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        itemsProcessed: cameras.length,
        itemsSucceeded: succeeded,
        itemsFailed: failed,
        resultSummary: {
          totalCameras: cameras.length,
          telemetryBackedChecks: succeeded,
          notAssessed,
          failed,
        },
      });
    } catch (error) {
      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error || 'Unknown error'),
      });
      throw error;
    }
  }

  /**
   * Run storage health checks
   */
  private async runStorageHealthChecks() {
    const jobExecution = await this.auditRepo.createComplianceJobExecution({
      tenantId: 'system',
      jobType: 'storage_health_check',
      jobName: 'Automated Storage Health Check',
      startedAt: new Date().toISOString(),
      status: 'running',
    });

    const jobExecutionId = String(jobExecution.id);

    try {
      const result = await this.pool.query<TelemetryAuditRow>(
        `SELECT DISTINCT ON (telemetry.tenant_id, telemetry.branch_id, telemetry.device_id)
                telemetry.tenant_id::text, telemetry.branch_id::text AS branch_node_id,
                telemetry.device_id, telemetry.observed_at, telemetry.received_at,
                telemetry.source, telemetry.quality, telemetry.idempotency_key,
                telemetry.metrics, telemetry.reason_codes
         FROM operational_health_telemetry telemetry
         WHERE telemetry.device_type = 'disk'
           AND telemetry.observed_at >= now() - interval '2 hours'
           AND NOT EXISTS (
             SELECT 1 FROM storage_health_checks checks
             WHERE checks.metadata->>'telemetryIdempotencyKey' = telemetry.idempotency_key
           )
         ORDER BY telemetry.tenant_id, telemetry.branch_id, telemetry.device_id,
                  telemetry.observed_at DESC, telemetry.received_at DESC`
      );

      const nodes = result.rows;
      let succeeded = 0;
      let notAssessed = 0;
      let failed = 0;

      for (const node of nodes) {
        try {
          const input = storageHealthAuditFromTelemetry(node);
          if (!input) {
            notAssessed++;
            continue;
          }
          await this.auditRepo.createStorageHealthCheck(input);
          succeeded++;
        } catch (error) {
          console.error(`Storage audit failed for device ${node.device_id}:`, error);
          failed++;
        }
      }

      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        itemsProcessed: nodes.length,
        itemsSucceeded: succeeded,
        itemsFailed: failed,
        resultSummary: { telemetryBackedChecks: succeeded, notAssessed, failed },
      });
    } catch (error) {
      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error || 'Unknown error'),
      });
    }
  }

  /**
   * Refresh materialized views
   */
  private async refreshHealthViews() {
    try {
      await this.auditRepo.refreshCameraHealthLatest();
      console.log('Refreshed camera health materialized view');
    } catch (error) {
      console.error('Failed to refresh health views:', error);
    }
  }

  /**
   * Run daily recording verification for all cameras
   */
  private async runDailyRecordingVerification() {
    const jobExecution = await this.auditRepo.createComplianceJobExecution({
      tenantId: 'system',
      jobType: 'recording_verification',
      jobName: 'Daily Recording Verification',
      startedAt: new Date().toISOString(),
      status: 'running',
    });

    const jobExecutionId = String(jobExecution.id);

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
      const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));
      const result = await this.pool.query<TelemetryAuditRow & { camera_id: string }>(
        `SELECT c.id::text AS camera_id, c.tenant_id::text,
                c.branch_node_id::text AS branch_node_id, archive.device_id,
                archive.observed_at, archive.received_at, archive.source,
                archive.quality, archive.idempotency_key, archive.metrics,
                archive.reason_codes
         FROM cameras c
         JOIN LATERAL (
           SELECT device_id, observed_at, received_at, source, quality,
                  idempotency_key, metrics, reason_codes
           FROM operational_health_telemetry
           WHERE tenant_id = c.tenant_id
             AND branch_id = c.branch_node_id
             AND device_type = 'archive'
             AND metrics->>'cameraId' = c.id::text
             AND observed_at >= now() - interval '36 hours'
           ORDER BY observed_at DESC, received_at DESC
           LIMIT 1
         ) archive ON true
         WHERE c.approval_status = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM recording_verification_jobs existing
             WHERE existing.camera_id = c.id
               AND existing.verification_date = $1::date
           )`,
        [yesterdayStart.toISOString().slice(0, 10)],
      );

      const cameras = result.rows;

      let succeeded = 0;
      let failed = 0;
      let notAssessed = 0;

      for (const camera of cameras) {
        try {
          const input = recordingVerificationFromArchiveTelemetry(
            camera,
            camera.camera_id,
            yesterdayStart,
            yesterdayEnd,
          );
          if (!input) {
            notAssessed++;
            continue;
          }
          await this.auditRepo.createRecordingVerificationJob(input);
          succeeded++;
        } catch (error) {
          console.error(`Recording verification failed for camera ${camera.camera_id}:`, error);
          failed++;
        }
      }

      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        itemsProcessed: cameras.length,
        itemsSucceeded: succeeded,
        itemsFailed: failed,
        resultSummary: { directArchiveChecks: succeeded, notAssessed, failed },
      });
    } catch (error) {
      await this.auditRepo.updateComplianceJobExecution(jobExecutionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error || 'Unknown error'),
      });
    }
  }

  /**
   * Run monthly compliance assessment for all frameworks
   */
  private async runMonthlyComplianceAssessment() {
    console.log('Running monthly compliance assessment...');
    
    const result = await this.pool.query(
      `SELECT DISTINCT f.id as framework_id, f.tenant_id 
       FROM compliance_frameworks f 
       WHERE f.status = 'active'`
    );

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    for (const framework of result.rows) {
      try {
        await this.complianceService.createComplianceAssessment({
          tenantId: framework.tenant_id,
          frameworkId: framework.framework_id,
          assessmentPeriodStart: periodStart.toISOString(),
          assessmentPeriodEnd: periodEnd.toISOString(),
          createdBy: 'system',
          runImmediately: true,
        });
      } catch (error) {
        console.error(`Assessment failed for framework ${framework.framework_id}:`, error);
      }
    }
  }

  /**
   * Check for overdue maintenance work orders
   */
  private async checkOverdueMaintenance() {
    console.log('Checking overdue maintenance...');
    
    const result = await this.pool.query(
      `SELECT * FROM maintenance_work_orders 
       WHERE scheduled_date < CURRENT_DATE 
       AND status NOT IN ('completed', 'closed', 'cancelled')`
    );

    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} overdue maintenance work orders`);
      // Here you would trigger alerts/notifications
    }
  }

  /**
   * Check for expiring certificates
   */
  private async checkCertificateExpiry() {
    console.log('Checking certificate expiry...');
    
    const result = await this.pool.query(
      `SELECT * FROM compliance_certificates 
       WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days'
       AND expiry_date >= CURRENT_DATE
       AND status != 'revoked'`
    );

    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} certificates expiring within 30 days`);
      // Here you would trigger alerts/notifications
    }
  }

  /**
   * Analyze access logs for unusual patterns
   */
  private async analyzeAccessLogs() {
    console.log('Analyzing access logs...');
    
    // Check for high denial rates
    const result = await this.pool.query(
      `SELECT 
        user_id,
        user_name,
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE access_result = 'denied') as denied_attempts
       FROM video_access_logs 
       WHERE access_timestamp >= CURRENT_DATE
       GROUP BY user_id, user_name
       HAVING COUNT(*) FILTER (WHERE access_result = 'denied') > 5`
    );

    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} users with high access denial rates`);
      // Here you would trigger security alerts
    }
  }
}
