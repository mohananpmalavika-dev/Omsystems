/**
 * Metrics Collector Service
 * 
 * Collects and aggregates metrics for:
 * - Queue analysis (wait times)
 * - Footfall tracking
 * - SLA compliance
 * 
 * Runs as scheduled jobs to populate data_completeness tables.
 */

import { Pool } from 'pg';

// ============================================================================
// Configuration
// ============================================================================

interface MetricsCollectorConfig {
  pool: Pool;
  enabled?: boolean;
  logActivity?: boolean;
}

let config: MetricsCollectorConfig;

/**
 * Initialize metrics collector
 */
export function initializeMetricsCollector(collectorConfig: MetricsCollectorConfig): void {
  config = {
    enabled: true,
    logActivity: true,
    ...collectorConfig
  };
  
  console.log('[MetricsCollector] Initialized');
}

// ============================================================================
// FOOTFALL METRICS COLLECTION
// ============================================================================

/**
 * Aggregate footfall from analytics_events (runs hourly)
 */
export async function collectFootfallMetrics(): Promise<void> {
  if (!config || !config.enabled || !config.pool) {
    console.error('[MetricsCollector] Not initialized');
    return;
  }

  try {
    const startTime = Date.now();
    
    // Call database function to aggregate footfall
    await config.pool.query('SELECT aggregate_footfall_from_analytics()');
    
    const duration = Date.now() - startTime;
    
    if (config.logActivity) {
      console.log(`[MetricsCollector] Footfall aggregation completed in ${duration}ms`);
    }
  } catch (error) {
    console.error('[MetricsCollector] Error collecting footfall metrics:', error);
    throw error;
  }
}

/**
 * Manually aggregate footfall for specific date range (for backfilling)
 */
export async function backfillFootfallMetrics(
  startDate: Date,
  endDate: Date
): Promise<void> {
  if (!config || !config.pool) {
    throw new Error('MetricsCollector not initialized');
  }

  try {
    console.log(`[MetricsCollector] Backfilling footfall from ${startDate} to ${endDate}`);
    
    const result = await config.pool.query(`
      INSERT INTO footfall_events (
        tenant_id,
        branch_id,
        camera_id,
        entries,
        exits,
        direction,
        hour_of_day,
        date,
        detection_type,
        confidence_score
      )
      SELECT 
        ae.tenant_id,
        c.branch_id,
        ae.camera_id,
        COUNT(*) FILTER (WHERE ae.metadata->>'direction' = 'entry') as entries,
        COUNT(*) FILTER (WHERE ae.metadata->>'direction' = 'exit') as exits,
        'bidirectional' as direction,
        EXTRACT(HOUR FROM ae.occurred_at)::INT as hour_of_day,
        DATE(ae.occurred_at) as date,
        ae.detection_type,
        AVG((ae.metadata->>'confidence')::NUMERIC) as confidence_score
      FROM analytics_events ae
      JOIN cameras c ON c.id = ae.camera_id
      WHERE ae.detection_type IN ('line-crossing', 'footfall', 'customer-counting', 'person-counting')
        AND ae.occurred_at >= $1
        AND ae.occurred_at < $2
      GROUP BY 
        ae.tenant_id,
        c.branch_id,
        ae.camera_id,
        EXTRACT(HOUR FROM ae.occurred_at),
        DATE(ae.occurred_at),
        ae.detection_type
      ON CONFLICT (branch_id, camera_id, date, hour_of_day) 
      DO UPDATE SET
        entries = footfall_events.entries + EXCLUDED.entries,
        exits = footfall_events.exits + EXCLUDED.exits,
        measured_at = NOW()
    `, [startDate, endDate]);
    
    console.log(`[MetricsCollector] Backfilled ${result.rowCount} footfall records`);
  } catch (error) {
    console.error('[MetricsCollector] Error backfilling footfall:', error);
    throw error;
  }
}

// ============================================================================
// QUEUE METRICS COLLECTION
// ============================================================================

/**
 * Collect queue metrics from analytics events (runs every 5 minutes)
 */
export async function collectQueueMetrics(): Promise<void> {
  if (!config || !config.enabled || !config.pool) {
    console.error('[MetricsCollector] Not initialized');
    return;
  }

  try {
    const startTime = Date.now();
    
    // Get queue analysis events from last 5 minutes
    const result = await config.pool.query(`
      INSERT INTO queue_metrics (
        tenant_id,
        branch_id,
        camera_id,
        queue_length,
        max_queue_length,
        avg_queue_length,
        avg_wait_seconds,
        max_wait_seconds,
        min_wait_seconds,
        people_served,
        abandonment_count,
        measurement_start,
        measurement_end,
        detection_confidence
      )
      SELECT 
        ae.tenant_id,
        c.branch_id,
        ae.camera_id,
        (ae.metadata->>'queueLength')::INT as queue_length,
        MAX((ae.metadata->>'queueLength')::INT) as max_queue_length,
        AVG((ae.metadata->>'queueLength')::INT) as avg_queue_length,
        AVG((ae.metadata->>'estimatedWaitSeconds')::INT) as avg_wait_seconds,
        MAX((ae.metadata->>'estimatedWaitSeconds')::INT) as max_wait_seconds,
        MIN((ae.metadata->>'estimatedWaitSeconds')::INT) as min_wait_seconds,
        SUM((ae.metadata->>'peopleServed')::INT) as people_served,
        SUM((ae.metadata->>'abandonments')::INT) as abandonment_count,
        MIN(ae.occurred_at) as measurement_start,
        MAX(ae.occurred_at) as measurement_end,
        AVG((ae.metadata->>'confidence')::NUMERIC) as detection_confidence
      FROM analytics_events ae
      JOIN cameras c ON c.id = ae.camera_id
      WHERE ae.detection_type = 'queue-analysis'
        AND ae.occurred_at >= NOW() - INTERVAL '5 minutes'
        AND ae.metadata->>'queueLength' IS NOT NULL
        AND ae.metadata->>'estimatedWaitSeconds' IS NOT NULL
      GROUP BY 
        ae.tenant_id,
        c.branch_id,
        ae.camera_id,
        (ae.metadata->>'queueLength')::INT
      RETURNING id
    `);
    
    const duration = Date.now() - startTime;
    
    if (config.logActivity) {
      console.log(`[MetricsCollector] Queue metrics: ${result.rowCount} records in ${duration}ms`);
    }
  } catch (error) {
    console.error('[MetricsCollector] Error collecting queue metrics:', error);
    // Don't throw - queue data might not exist for all cameras
  }
}

// ============================================================================
// SLA COMPLIANCE CALCULATION
// ============================================================================

/**
 * Calculate SLA compliance (runs daily)
 */
export async function calculateSLACompliance(): Promise<void> {
  if (!config || !config.enabled || !config.pool) {
    console.error('[MetricsCollector] Not initialized');
    return;
  }

  try {
    const startTime = Date.now();
    
    // Call database function to calculate SLA compliance
    await config.pool.query('SELECT calculate_daily_sla_compliance()');
    
    const duration = Date.now() - startTime;
    
    if (config.logActivity) {
      console.log(`[MetricsCollector] SLA compliance calculated in ${duration}ms`);
    }
  } catch (error) {
    console.error('[MetricsCollector] Error calculating SLA compliance:', error);
    throw error;
  }
}

/**
 * Calculate real-time SLA compliance for specific metric
 */
export async function calculateRealtimeSLA(
  metricType: string,
  branchId?: string
): Promise<{
  actualValue: number;
  targetValue: number;
  compliancePercentage: number;
  status: string;
}> {
  if (!config || !config.pool) {
    throw new Error('MetricsCollector not initialized');
  }

  try {
    // Get SLA configuration
    const configResult = await config.pool.query(
      `SELECT * FROM sla_configuration 
       WHERE metric_type = $1 
         AND (branch_id = $2 OR (branch_id IS NULL AND $2 IS NULL))
         AND active = true
       LIMIT 1`,
      [metricType, branchId]
    );

    if (configResult.rows.length === 0) {
      throw new Error(`SLA configuration not found for ${metricType}`);
    }

    const slaConfig = configResult.rows[0];
    let actualValue = 0;

    // Calculate actual value based on metric type
    switch (metricType) {
      case 'p1_response_time':
        const p1Result = await config.pool.query(`
          SELECT AVG(EXTRACT(EPOCH FROM (acknowledged_at - detected_at))) as avg_seconds
          FROM incidents
          WHERE severity = 'P1'
            AND detected_at >= NOW() - INTERVAL '24 hours'
            AND (branch_id = $1 OR $1 IS NULL)
            AND acknowledged_at IS NOT NULL
        `, [branchId]);
        actualValue = p1Result.rows[0]?.avg_seconds || 0;
        break;

      case 'camera_availability':
        const cameraResult = await config.pool.query(`
          SELECT 
            100.0 * COUNT(*) FILTER (WHERE status = 'online') / 
            NULLIF(COUNT(*), 0) as availability
          FROM cameras
          WHERE (branch_id = $1 OR $1 IS NULL)
        `, [branchId]);
        actualValue = cameraResult.rows[0]?.availability || 0;
        break;

      case 'system_uptime':
        const uptimeResult = await config.pool.query(`
          SELECT 
            100.0 * COUNT(*) FILTER (WHERE status != 'offline') / 
            NULLIF(COUNT(*), 0) as uptime
          FROM cameras
          WHERE (branch_id = $1 OR $1 IS NULL)
        `, [branchId]);
        actualValue = uptimeResult.rows[0]?.uptime || 0;
        break;

      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }

    const targetValue = parseFloat(slaConfig.target_value);
    const compliancePercentage = Math.round((actualValue / targetValue) * 100);
    
    let status = 'met';
    if (actualValue < slaConfig.threshold_critical) {
      status = 'critical';
    } else if (actualValue < slaConfig.threshold_warning) {
      status = 'warning';
    }

    return {
      actualValue: Math.round(actualValue * 100) / 100,
      targetValue,
      compliancePercentage,
      status
    };
  } catch (error) {
    console.error('[MetricsCollector] Error calculating real-time SLA:', error);
    throw error;
  }
}

// ============================================================================
// SCHEDULED JOB ORCHESTRATION
// ============================================================================

/**
 * Start all scheduled metrics collection jobs
 */
export function startScheduledJobs(): void {
  if (!config || !config.enabled) {
    console.warn('[MetricsCollector] Not starting jobs - collector not initialized or disabled');
    return;
  }

  console.log('[MetricsCollector] Starting scheduled jobs...');

  // Job 1: Collect queue metrics every 5 minutes
  setInterval(() => {
    collectQueueMetrics().catch(err => {
      console.error('[MetricsCollector] Queue metrics job failed:', err);
    });
  }, 5 * 60 * 1000); // 5 minutes

  // Job 2: Aggregate footfall every hour (at :05 past the hour)
  const msUntilNextHour = (60 - new Date().getMinutes()) * 60 * 1000;
  const msAt05Minutes = 5 * 60 * 1000;
  
  setTimeout(() => {
    collectFootfallMetrics().catch(err => {
      console.error('[MetricsCollector] Footfall aggregation job failed:', err);
    });
    
    // Then run hourly
    setInterval(() => {
      collectFootfallMetrics().catch(err => {
        console.error('[MetricsCollector] Footfall aggregation job failed:', err);
      });
    }, 60 * 60 * 1000); // 1 hour
  }, msUntilNextHour + msAt05Minutes);

  // Job 3: Calculate SLA compliance daily at 1:00 AM
  const now = new Date();
  const next1AM = new Date(now);
  next1AM.setHours(1, 0, 0, 0);
  if (next1AM < now) {
    next1AM.setDate(next1AM.getDate() + 1);
  }
  const msUntil1AM = next1AM.getTime() - now.getTime();

  setTimeout(() => {
    calculateSLACompliance().catch(err => {
      console.error('[MetricsCollector] SLA calculation job failed:', err);
    });
    
    // Then run daily
    setInterval(() => {
      calculateSLACompliance().catch(err => {
        console.error('[MetricsCollector] SLA calculation job failed:', err);
      });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntil1AM);

  console.log('[MetricsCollector] Scheduled jobs started:');
  console.log('  - Queue metrics: every 5 minutes');
  console.log('  - Footfall aggregation: hourly at :05');
  console.log('  - SLA calculation: daily at 1:00 AM');
}

/**
 * Run all metrics collection manually (for testing or backfilling)
 */
export async function runAllMetricsCollection(): Promise<void> {
  console.log('[MetricsCollector] Running all metrics collection...');
  
  try {
    await collectQueueMetrics();
    await collectFootfallMetrics();
    await calculateSLACompliance();
    
    console.log('[MetricsCollector] ✓ All metrics collection completed');
  } catch (error) {
    console.error('[MetricsCollector] Error running metrics collection:', error);
    throw error;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  initializeMetricsCollector,
  collectFootfallMetrics,
  backfillFootfallMetrics,
  collectQueueMetrics,
  calculateSLACompliance,
  calculateRealtimeSLA,
  startScheduledJobs,
  runAllMetricsCollection
};
