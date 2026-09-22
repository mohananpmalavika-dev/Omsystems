// @ts-nocheck
/**
 * AI Metrics Collector Service
 * 
 * Collects, aggregates, and stores AI capability performance metrics.
 * Buffers events in memory and performs bulk inserts to database.
 * 
 * Architecture:
 * - In-memory buffer with configurable batch size
 * - Automatic flush on batch size or time interval
 * - Aggregation by tenant/capability/camera/hour
 * - Upsert strategy to handle duplicates
 * - Graceful degradation if database unavailable
 * 
 * Integration Points:
 * - Analytics engine: Reports each detection event
 * - Incident system: Links to incidents
 * - ROI calculator: Provides cost avoided calculations
 * 
 * Status: Production-ready with error handling
 */

import { pool } from '../database/pool.js';
import { EventEmitter } from 'events';

export interface AIMetricEvent {
  tenant_id: string;
  capability_type: string;
  capability_domain: string;
  capability_stage?: string;
  camera_id: string;
  branch_id: string;
  zone_id?: string;
  region_id?: string;
  detection_result: {
    is_true_positive: boolean;
    is_false_positive: boolean;
    is_false_negative: boolean;
    confidence_score: number;
    inference_time_ms: number;
  };
  incident_detected?: boolean;
  incident_prevented?: boolean;
  investigation_time_saved_minutes?: number;
  estimated_cost_avoided?: number;
  model_name?: string;
  model_version?: string;
  timestamp: Date;
}

interface AggregatedMetrics {
  tenant_id: string;
  capability_type: string;
  capability_domain: string;
  capability_stage?: string;
  camera_id: string;
  branch_id: string;
  zone_id?: string;
  region_id?: string;
  measured_at: Date;
  detections_count: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
  accuracy_percent: number;
  precision_percent: number;
  recall_percent: number;
  f1_score: number;
  false_positive_rate: number;
  avg_inference_ms: number;
  min_inference_ms: number;
  max_inference_ms: number;
  p50_inference_ms: number;
  p95_inference_ms: number;
  p99_inference_ms: number;
  incidents_detected: number;
  incidents_prevented: number;
  investigation_time_saved_minutes: number;
  estimated_cost_avoided: number;
  model_name?: string;
  model_version?: string;
}

export class AiMetricsCollectorService extends EventEmitter {
  private buffer: AIMetricEvent[] = [];
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 60000; // 1 minute
  private flushTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor() {
    super();
    this.startFlushTimer();
  }

  /**
   * Record a single detection event (called by analytics engine)
   */
  async recordDetection(event: AIMetricEvent): Promise<void> {
    if (this.isShuttingDown) {
      console.warn('Metrics collector is shutting down, event not recorded');
      return;
    }

    this.buffer.push(event);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  /**
   * Manually flush buffer to database
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // Aggregate events by capability/camera/hour
      const aggregated = this.aggregateEvents(events);

      // Bulk insert into database
      await this.bulkUpsert(aggregated);

      this.emit('metrics_flushed', { count: events.length, aggregated: aggregated.length });
      console.log(
        `[AI Metrics] Flushed ${events.length} events into ${aggregated.length} aggregated records`,
      );
    } catch (error) {
      console.error('[AI Metrics] Failed to flush metrics:', error);
      // Re-add to buffer for retry (but limit buffer size to prevent memory issues)
      if (this.buffer.length < this.BATCH_SIZE * 5) {
        this.buffer.unshift(...events);
      } else {
        console.error('[AI Metrics] Buffer overflow, dropping events');
        this.emit('metrics_dropped', { count: events.length });
      }
    }
  }

  /**
   * Aggregate events by tenant/capability/camera/hour
   */
  private aggregateEvents(events: AIMetricEvent[]): AggregatedMetrics[] {
    const grouped = new Map<string, any>();

    events.forEach((event) => {
      // Group by: tenant, capability, camera, hour
      const hour = new Date(event.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = `${event.tenant_id}:${event.capability_type}:${event.camera_id}:${hour.getTime()}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          tenant_id: event.tenant_id,
          capability_type: event.capability_type,
          capability_domain: event.capability_domain,
          capability_stage: event.capability_stage,
          camera_id: event.camera_id,
          branch_id: event.branch_id,
          zone_id: event.zone_id,
          region_id: event.region_id,
          measured_at: hour,
          detections_count: 0,
          true_positives: 0,
          false_positives: 0,
          false_negatives: 0,
          true_negatives: 0,
          incidents_detected: 0,
          incidents_prevented: 0,
          investigation_time_saved_minutes: 0,
          estimated_cost_avoided: 0,
          inference_times: [],
          model_name: event.model_name,
          model_version: event.model_version,
        });
      }

      const agg = grouped.get(key);
      agg.detections_count++;

      if (event.detection_result.is_true_positive) agg.true_positives++;
      if (event.detection_result.is_false_positive) agg.false_positives++;
      if (event.detection_result.is_false_negative) agg.false_negatives++;

      if (event.incident_detected) agg.incidents_detected++;
      if (event.incident_prevented) agg.incidents_prevented++;
      if (event.investigation_time_saved_minutes) {
        agg.investigation_time_saved_minutes += event.investigation_time_saved_minutes;
      }
      if (event.estimated_cost_avoided) {
        agg.estimated_cost_avoided += event.estimated_cost_avoided;
      }

      agg.inference_times.push(event.detection_result.inference_time_ms);
    });

    // Calculate statistics and metrics
    return Array.from(grouped.values()).map((agg) => {
      const inferenceTimes = agg.inference_times.sort((a: number, b: number) => a - b);
      const tp = agg.true_positives;
      const fp = agg.false_positives;
      const fn = agg.false_negatives;
      const tn = agg.true_negatives;

      // Calculate accuracy: (TP + TN) / (TP + TN + FP + FN)
      // Note: True negatives are difficult to measure in object detection
      // We approximate by assuming TN = detections that didn't trigger (not directly measured)
      const total = tp + fp + fn;
      const accuracy_percent = total > 0 ? (tp / total) * 100 : 0;

      // Precision: TP / (TP + FP)
      const precision_percent = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;

      // Recall: TP / (TP + FN)
      const recall_percent = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;

      // F1 Score: 2 * (precision * recall) / (precision + recall)
      const precision = precision_percent / 100;
      const recall = recall_percent / 100;
      const f1_score =
        precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      // False Positive Rate: FP / (FP + TN)
      // Approximation: FP rate relative to total detections
      const false_positive_rate = total > 0 ? (fp / total) * 100 : 0;

      // Inference time statistics
      const sum = inferenceTimes.reduce((a: number, b: number) => a + b, 0);
      const avg_inference_ms = sum / inferenceTimes.length;
      const min_inference_ms = Math.min(...inferenceTimes);
      const max_inference_ms = Math.max(...inferenceTimes);

      // Percentiles
      const p50_index = Math.floor(inferenceTimes.length * 0.5);
      const p95_index = Math.floor(inferenceTimes.length * 0.95);
      const p99_index = Math.floor(inferenceTimes.length * 0.99);
      const p50_inference_ms = inferenceTimes[p50_index] || avg_inference_ms;
      const p95_inference_ms = inferenceTimes[p95_index] || max_inference_ms;
      const p99_inference_ms = inferenceTimes[p99_index] || max_inference_ms;

      return {
        tenant_id: agg.tenant_id,
        capability_type: agg.capability_type,
        capability_domain: agg.capability_domain,
        capability_stage: agg.capability_stage,
        camera_id: agg.camera_id,
        branch_id: agg.branch_id,
        zone_id: agg.zone_id,
        region_id: agg.region_id,
        measured_at: agg.measured_at,
        detections_count: agg.detections_count,
        true_positives: tp,
        false_positives: fp,
        false_negatives: fn,
        true_negatives: tn,
        accuracy_percent: Math.round(accuracy_percent * 100) / 100,
        precision_percent: Math.round(precision_percent * 100) / 100,
        recall_percent: Math.round(recall_percent * 100) / 100,
        f1_score: Math.round(f1_score * 10000) / 10000,
        false_positive_rate: Math.round(false_positive_rate * 100) / 100,
        avg_inference_ms: Math.round(avg_inference_ms * 100) / 100,
        min_inference_ms: Math.round(min_inference_ms * 100) / 100,
        max_inference_ms: Math.round(max_inference_ms * 100) / 100,
        p50_inference_ms: Math.round(p50_inference_ms * 100) / 100,
        p95_inference_ms: Math.round(p95_inference_ms * 100) / 100,
        p99_inference_ms: Math.round(p99_inference_ms * 100) / 100,
        incidents_detected: agg.incidents_detected,
        incidents_prevented: agg.incidents_prevented,
        investigation_time_saved_minutes: agg.investigation_time_saved_minutes,
        estimated_cost_avoided: Math.round(agg.estimated_cost_avoided * 100) / 100,
        model_name: agg.model_name,
        model_version: agg.model_version,
      };
    });
  }

  /**
   * Bulk insert/update aggregated metrics
   */
  private async bulkUpsert(records: AggregatedMetrics[]): Promise<void> {
    if (records.length === 0) return;

    // Build VALUES clause for bulk insert
    const values = records
      .map(
        (r, i) => `(
        $${i * 31 + 1}, $${i * 31 + 2}, $${i * 31 + 3}, $${i * 31 + 4}, 
        $${i * 31 + 5}, $${i * 31 + 6}, $${i * 31 + 7}, $${i * 31 + 8},
        $${i * 31 + 9}, $${i * 31 + 10}, $${i * 31 + 11}, $${i * 31 + 12},
        $${i * 31 + 13}, $${i * 31 + 14}, $${i * 31 + 15}, $${i * 31 + 16},
        $${i * 31 + 17}, $${i * 31 + 18}, $${i * 31 + 19}, $${i * 31 + 20},
        $${i * 31 + 21}, $${i * 31 + 22}, $${i * 31 + 23}, $${i * 31 + 24},
        $${i * 31 + 25}, $${i * 31 + 26}, $${i * 31 + 27}, $${i * 31 + 28},
        $${i * 31 + 29}, $${i * 31 + 30}, $${i * 31 + 31}
      )`,
      )
      .join(',');

    // Flatten all parameters
    const params = records.flatMap((r) => [
      r.tenant_id,
      r.capability_type,
      r.capability_domain,
      r.capability_stage || null,
      r.camera_id,
      r.branch_id,
      r.zone_id || null,
      r.region_id || null,
      r.measured_at,
      r.detections_count,
      r.true_positives,
      r.false_positives,
      r.false_negatives,
      r.true_negatives,
      r.accuracy_percent,
      r.precision_percent,
      r.recall_percent,
      r.f1_score,
      r.false_positive_rate,
      r.avg_inference_ms,
      r.min_inference_ms,
      r.max_inference_ms,
      r.p50_inference_ms,
      r.p95_inference_ms,
      r.p99_inference_ms,
      r.incidents_detected,
      r.incidents_prevented,
      r.investigation_time_saved_minutes,
      r.estimated_cost_avoided,
      r.model_name || null,
      r.model_version || null,
    ]);

    const query = `
      INSERT INTO ai_capability_metrics (
        tenant_id, capability_type, capability_domain, capability_stage,
        camera_id, branch_id, zone_id, region_id, measured_at,
        detections_count, true_positives, false_positives, false_negatives, true_negatives,
        accuracy_percent, precision_percent, recall_percent, f1_score, false_positive_rate,
        avg_inference_ms, min_inference_ms, max_inference_ms,
        p50_inference_ms, p95_inference_ms, p99_inference_ms,
        incidents_detected, incidents_prevented, investigation_time_saved_minutes,
        estimated_cost_avoided, model_name, model_version
      ) VALUES ${values}
      ON CONFLICT (tenant_id, capability_type, camera_id, measured_at) 
      DO UPDATE SET
        detections_count = ai_capability_metrics.detections_count + EXCLUDED.detections_count,
        true_positives = ai_capability_metrics.true_positives + EXCLUDED.true_positives,
        false_positives = ai_capability_metrics.false_positives + EXCLUDED.false_positives,
        false_negatives = ai_capability_metrics.false_negatives + EXCLUDED.false_negatives,
        true_negatives = ai_capability_metrics.true_negatives + EXCLUDED.true_negatives,
        incidents_detected = ai_capability_metrics.incidents_detected + EXCLUDED.incidents_detected,
        incidents_prevented = ai_capability_metrics.incidents_prevented + EXCLUDED.incidents_prevented,
        investigation_time_saved_minutes = ai_capability_metrics.investigation_time_saved_minutes + EXCLUDED.investigation_time_saved_minutes,
        estimated_cost_avoided = ai_capability_metrics.estimated_cost_avoided + EXCLUDED.estimated_cost_avoided,
        -- Recalculate averages
        accuracy_percent = (ai_capability_metrics.accuracy_percent * ai_capability_metrics.detections_count + EXCLUDED.accuracy_percent * EXCLUDED.detections_count) / (ai_capability_metrics.detections_count + EXCLUDED.detections_count),
        precision_percent = (ai_capability_metrics.precision_percent * ai_capability_metrics.detections_count + EXCLUDED.precision_percent * EXCLUDED.detections_count) / (ai_capability_metrics.detections_count + EXCLUDED.detections_count),
        recall_percent = (ai_capability_metrics.recall_percent * ai_capability_metrics.detections_count + EXCLUDED.recall_percent * EXCLUDED.detections_count) / (ai_capability_metrics.detections_count + EXCLUDED.detections_count),
        avg_inference_ms = (ai_capability_metrics.avg_inference_ms * ai_capability_metrics.detections_count + EXCLUDED.avg_inference_ms * EXCLUDED.detections_count) / (ai_capability_metrics.detections_count + EXCLUDED.detections_count),
        min_inference_ms = LEAST(ai_capability_metrics.min_inference_ms, EXCLUDED.min_inference_ms),
        max_inference_ms = GREATEST(ai_capability_metrics.max_inference_ms, EXCLUDED.max_inference_ms)
    `;

    await pool.query(query, params);
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0) {
        await this.flush();
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Graceful shutdown - flush remaining events
   */
  async shutdown(): Promise<void> {
    console.log('[AI Metrics] Shutting down collector...');
    this.isShuttingDown = true;
    this.stopFlushTimer();
    await this.flush();
    console.log('[AI Metrics] Collector shutdown complete');
  }

  /**
   * Get current buffer status
   */
  getStatus(): { bufferSize: number; isActive: boolean } {
    return {
      bufferSize: this.buffer.length,
      isActive: !this.isShuttingDown,
    };
  }
}

// Singleton instance
export const aiMetricsCollectorService = new AiMetricsCollectorService();

// Graceful shutdown on process exit
process.on('SIGTERM', async () => {
  await aiMetricsCollectorService.shutdown();
});

process.on('SIGINT', async () => {
  await aiMetricsCollectorService.shutdown();
});
