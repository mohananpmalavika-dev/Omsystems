/**
 * Crowd Density & Queue Length Detection Service
 * 
 * Production orchestrator for spatial density estimation, queue depth & SLA tracking,
 * automated security alert dispatch, and branch operational recommendations with zero mock data.
 */

import type { Pool } from 'pg';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import { DensityEstimator } from './density-estimator.js';
import { QueueMonitor } from './queue-monitor.js';
import {
  CrowdRepository,
  type ListIncidentsFilter,
} from './crowd-repository.js';
import type {
  CrowdZoneRecord,
  CounterQueueRecord,
  CrowdQueueIncidentRecord,
  CrowdQueueConfigRecord,
  FrameAnalysisInput,
  FrameAnalysisResult,
  ZoneDensityResult,
  QueueMetricResult,
  CounterRecommendation,
  CrowdKPIStats,
  IncidentReviewStatus,
} from './types.js';

export class CrowdService {
  private readonly repository: CrowdRepository;
  private readonly queueMonitor: QueueMonitor;
  private readonly zoneCountHistory = new Map<string, number[]>();

  constructor(
    pool?: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repository = new CrowdRepository(pool);
    this.queueMonitor = new QueueMonitor();
  }

  public getRepository(): CrowdRepository {
    return this.repository;
  }

  /**
   * Primary frame observation ingestion and live analytics pipeline
   */
  public async analyzeFrame(input: FrameAnalysisInput): Promise<FrameAnalysisResult> {
    const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    const timestampMs = timestamp.getTime();

    // 1. Fetch configured zones and counter queues
    const allZones = await this.repository.listZones(input.tenantId, input.branchId);
    const activeZones = allZones.filter(z => z.enabled);

    const allQueues = await this.repository.listCounterQueues(input.tenantId, input.branchId);
    const activeQueues = allQueues.filter(q => q.enabled);

    const zoneResults: ZoneDensityResult[] = [];
    const queueResults: QueueMetricResult[] = [];
    const createdIncidents: CrowdQueueIncidentRecord[] = [];

    // 2. Evaluate crowd density for each monitored zone
    for (const zone of activeZones) {
      const history = this.zoneCountHistory.get(zone.id) || [];
      const density = DensityEstimator.estimateZoneDensity(zone, input.persons, history);

      // Update history buffer
      history.push(density.personCount);
      if (history.length > 20) history.shift();
      this.zoneCountHistory.set(zone.id, history);

      zoneResults.push(density);

      // Persist snapshot to database
      await this.repository.saveDensitySnapshot({
        tenant_id: input.tenantId,
        branch_id: zone.branch_id,
        zone_id: zone.id,
        camera_id: zone.camera_id || input.cameraId || null,
        person_count: density.personCount,
        density_level: density.densityLevel,
        occupancy_percentage: density.occupancyPercentage,
        density_per_sqm: density.densityPerSqm,
        average_speed: density.averageSpeed,
        is_bottleneck: density.isBottleneck,
        heat_intensity: density.heatIntensity,
        trend: density.trend,
        snapshot_metadata: {
          participantCount: density.participantTrackIds.length,
          centroid: density.centroid,
        },
        timestamp,
      });

      // Check for alert trigger
      if (density.requiresAlert && density.alertSeverity) {
        const incident = await this.repository.saveIncident({
          tenant_id: input.tenantId,
          branch_id: zone.branch_id,
          camera_id: zone.camera_id || input.cameraId || null,
          incident_type: density.isBottleneck ? 'stampede_risk_bottleneck' : 'crowd_density_exceeded',
          severity: density.alertSeverity,
          entity_type: 'zone',
          entity_id: zone.id,
          entity_name: zone.zone_name,
          trigger_value: density.personCount,
          threshold_value: zone.warning_capacity,
          confidence: 0.92,
          explanation: density.isBottleneck
            ? `Severe choke-point bottleneck detected in '${zone.zone_name}' (${density.personCount} persons, low velocity ${density.averageSpeed}m/s).`
            : `Crowd density threshold exceeded in '${zone.zone_name}'. Current occupancy: ${density.personCount} (Warning threshold: ${zone.warning_capacity}, Max: ${zone.max_capacity}).`,
          snapshot_url: input.snapshotUrl || null,
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          resolution_notes: null,
          metadata: {
            occupancyPercentage: density.occupancyPercentage,
            densityPerSqm: density.densityPerSqm,
            trend: density.trend,
            participantTrackIds: density.participantTrackIds,
          },
          occurred_at: timestamp,
        });

        createdIncidents.push(incident);

        // Dispatch alert to central control plane store
        if (this.store && typeof (this.store as any).createAlert === 'function') {
          try {
            await (this.store as any).createAlert({
              tenantId: input.tenantId,
              cameraId: zone.camera_id || input.cameraId,
              alertType: 'CROWD_GATHERING',
              severity: density.alertSeverity,
              title: `Crowd Density Surge Alert (${zone.zone_name})`,
              description: incident.explanation,
              metadata: {
                incidentId: incident.id,
                zoneId: zone.id,
                zoneName: zone.zone_name,
                occupancy: density.personCount,
                densityLevel: density.densityLevel,
              },
              snapshotReference: input.snapshotUrl,
              occurredAt: timestamp,
            });
          } catch (alertErr) {
            console.error('[CrowdService] Failed to dispatch crowd alert to store:', alertErr);
          }
        }
      }
    }

    // 3. Evaluate counter queues
    for (const queue of activeQueues) {
      const metric = this.queueMonitor.evaluateCounterQueue(queue, input.persons, timestampMs);
      queueResults.push(metric);

      // Persist queue snapshot
      await this.repository.saveQueueSnapshot({
        tenant_id: input.tenantId,
        branch_id: queue.branch_id,
        queue_id: queue.id,
        camera_id: queue.camera_id || input.cameraId || null,
        current_queue_length: metric.currentQueueLength,
        served_person_count: metric.servedPersonCount,
        avg_wait_time_seconds: metric.avgWaitTimeSeconds,
        max_wait_time_seconds: metric.maxWaitTimeSeconds,
        is_counter_attended: metric.isCounterAttended,
        threshold_exceeded: metric.thresholdExceeded,
        bottleneck_detected: metric.bottleneckDetected,
        participant_track_ids: metric.participantTrackIds,
        snapshot_metadata: {
          waitingPersonsCount: metric.waitingPersons.length,
        },
        timestamp,
      });

      // Check for queue incidents
      if (metric.requiresAlert && metric.incidentType && metric.alertSeverity) {
        let explanation = '';
        let triggerValue = metric.currentQueueLength;
        let thresholdValue = queue.max_queue_length_threshold;

        if (metric.incidentType === 'unattended_counter_with_queue') {
          explanation = `Counter ${queue.counter_number} (${queue.counter_name}) is unattended while ${metric.currentQueueLength} customers are waiting in queue.`;
        } else if (metric.incidentType === 'wait_time_sla_breach') {
          triggerValue = metric.maxWaitTimeSeconds;
          thresholdValue = queue.max_wait_time_seconds_threshold;
          explanation = `Customer wait time SLA breached at Counter ${queue.counter_number} (${Math.round(metric.maxWaitTimeSeconds / 60)}m wait vs SLA of ${Math.round(queue.max_wait_time_seconds_threshold / 60)}m).`;
        } else if (metric.incidentType === 'queue_length_exceeded') {
          explanation = `Queue length exceeded at Counter ${queue.counter_number} (${metric.currentQueueLength} in line, threshold is ${queue.max_queue_length_threshold}).`;
        } else {
          explanation = `Queue bottleneck detected at Counter ${queue.counter_number}.`;
        }

        const incident = await this.repository.saveIncident({
          tenant_id: input.tenantId,
          branch_id: queue.branch_id,
          camera_id: queue.camera_id || input.cameraId || null,
          incident_type: metric.incidentType,
          severity: metric.alertSeverity,
          entity_type: 'counter_queue',
          entity_id: queue.id,
          entity_name: `${queue.counter_number} - ${queue.counter_name}`,
          trigger_value: triggerValue,
          threshold_value: thresholdValue,
          confidence: 0.95,
          explanation,
          snapshot_url: input.snapshotUrl || null,
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          resolution_notes: null,
          metadata: {
            queueLength: metric.currentQueueLength,
            avgWaitTimeSeconds: metric.avgWaitTimeSeconds,
            maxWaitTimeSeconds: metric.maxWaitTimeSeconds,
            isCounterAttended: metric.isCounterAttended,
            waitingPersons: metric.waitingPersons,
          },
          occurred_at: timestamp,
        });

        createdIncidents.push(incident);

        // Dispatch alert to store
        if (this.store && typeof (this.store as any).createAlert === 'function') {
          try {
            await (this.store as any).createAlert({
              tenantId: input.tenantId,
              cameraId: queue.camera_id || input.cameraId,
              alertType: 'AI_CROWD_THRESHOLD_EXCEEDED',
              severity: metric.alertSeverity,
              title: `Queue Threshold Alert (${queue.counter_number})`,
              description: incident.explanation,
              metadata: {
                incidentId: incident.id,
                queueId: queue.id,
                counterNumber: queue.counter_number,
                counterName: queue.counter_name,
                currentQueueLength: metric.currentQueueLength,
                avgWaitTime: metric.avgWaitTimeSeconds,
              },
              snapshotReference: input.snapshotUrl,
              occurredAt: timestamp,
            });
          } catch (alertErr) {
            console.error('[CrowdService] Failed to dispatch queue alert to store:', alertErr);
          }
        }
      }
    }

    // 4. Generate intelligent counter opening recommendations
    const recommendations = this.queueMonitor.generateRecommendations(activeQueues, queueResults);

    return {
      timestamp,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      totalPersonsDetected: input.persons.length,
      zones: zoneResults,
      queues: queueResults,
      incidents: createdIncidents,
      recommendations,
    };
  }

  /**
   * Get real-time live status of all zones and counter queues for a branch
   */
  public async getLiveStatus(
    tenantId: string,
    branchId?: string
  ): Promise<{
    timestamp: Date;
    zones: ZoneDensityResult[];
    queues: QueueMetricResult[];
    recommendations: CounterRecommendation[];
    kpis: CrowdKPIStats;
  }> {
    const zones = await this.repository.listZones(tenantId, branchId);
    const queues = await this.repository.listCounterQueues(tenantId, branchId);
    const kpis = await this.repository.getCrowdStats(tenantId, branchId);

    // Build zone density from latest snapshots
    const recentDensity = await this.repository.getHistoricalDensity(tenantId, branchId, undefined, undefined, undefined, 50);
    const latestZoneMap = new Map<string, any>();
    for (const d of recentDensity) {
      if (!latestZoneMap.has(d.zone_id)) {
        latestZoneMap.set(d.zone_id, d);
      }
    }

    const zoneResults: ZoneDensityResult[] = zones.map(z => {
      const snap = latestZoneMap.get(z.id);
      const count = snap ? snap.person_count : 0;
      const densityLevel = snap ? snap.density_level : 'empty';
      const occupancyPercentage = snap ? snap.occupancy_percentage : 0;
      const densityPerSqm = snap ? snap.density_per_sqm : 0;
      const avgSpeed = snap ? snap.average_speed : 0;
      const isBottleneck = snap ? snap.is_bottleneck : false;
      const heatIntensity = snap ? snap.heat_intensity : 0;
      const trend = snap ? snap.trend : 'stable';

      return {
        zoneId: z.id,
        zoneName: z.zone_name,
        zoneType: z.zone_type,
        personCount: count,
        densityLevel,
        occupancyPercentage,
        densityPerSqm,
        averageSpeed: avgSpeed,
        isBottleneck,
        heatIntensity,
        trend,
        participantTrackIds: [],
        centroid: DensityEstimator.calculatePolygonCentroid(z.polygon),
        requiresAlert: isBottleneck || densityLevel === 'dangerous' || densityLevel === 'overcrowded',
        alertSeverity: densityLevel === 'dangerous' ? 'P1' : 'P2',
      };
    });

    // Build queue metrics from latest snapshots
    const recentQueues = await this.repository.getHistoricalQueueMetrics(tenantId, branchId, undefined, undefined, undefined, 50);
    const latestQueueMap = new Map<string, any>();
    for (const q of recentQueues) {
      if (!latestQueueMap.has(q.queue_id)) {
        latestQueueMap.set(q.queue_id, q);
      }
    }

    const queueResults: QueueMetricResult[] = queues.map(q => {
      const snap = latestQueueMap.get(q.id);
      const length = snap ? snap.current_queue_length : 0;
      const served = snap ? snap.served_person_count : 0;
      const avgWait = snap ? snap.avg_wait_time_seconds : 0;
      const maxWait = snap ? snap.max_wait_time_seconds : 0;
      const attended = snap ? snap.is_counter_attended : true;
      const exceeded = length > q.max_queue_length_threshold;
      const bottleneck = snap ? snap.bottleneck_detected : false;

      return {
        queueId: q.id,
        counterNumber: q.counter_number,
        counterName: q.counter_name,
        counterType: q.counter_type,
        currentQueueLength: length,
        servedPersonCount: served,
        avgWaitTimeSeconds: avgWait,
        maxWaitTimeSeconds: maxWait,
        isCounterAttended: attended,
        thresholdExceeded: exceeded,
        bottleneckDetected: bottleneck,
        participantTrackIds: snap?.participant_track_ids || [],
        waitingPersons: [],
        requiresAlert: exceeded || !attended,
        alertSeverity: q.alert_severity,
      };
    });

    const recommendations = this.queueMonitor.generateRecommendations(queues, queueResults);

    return {
      timestamp: new Date(),
      zones: zoneResults,
      queues: queueResults,
      recommendations,
      kpis,
    };
  }

  // ============================================================================
  // DELEGATED PASS-THROUGHS
  // ============================================================================

  public listZones(tenantId: string, branchId?: string) {
    return this.repository.listZones(tenantId, branchId);
  }

  public getZoneById(id: string, tenantId: string) {
    return this.repository.getZoneById(id, tenantId);
  }

  public createZone(zone: Omit<CrowdZoneRecord, 'id' | 'created_at' | 'updated_at'>) {
    return this.repository.createZone(zone);
  }

  public updateZone(id: string, tenantId: string, updates: Partial<CrowdZoneRecord>) {
    return this.repository.updateZone(id, tenantId, updates);
  }

  public deleteZone(id: string, tenantId: string) {
    return this.repository.deleteZone(id, tenantId);
  }

  public listCounterQueues(tenantId: string, branchId?: string) {
    return this.repository.listCounterQueues(tenantId, branchId);
  }

  public getCounterQueueById(id: string, tenantId: string) {
    return this.repository.getCounterQueueById(id, tenantId);
  }

  public createCounterQueue(queue: Omit<CounterQueueRecord, 'id' | 'created_at' | 'updated_at'>) {
    return this.repository.createCounterQueue(queue);
  }

  public updateCounterQueue(id: string, tenantId: string, updates: Partial<CounterQueueRecord>) {
    return this.repository.updateCounterQueue(id, tenantId, updates);
  }

  public deleteCounterQueue(id: string, tenantId: string) {
    return this.repository.deleteCounterQueue(id, tenantId);
  }

  public getHistoricalDensity(
    tenantId: string,
    branchId?: string,
    zoneId?: string,
    fromDate?: Date,
    toDate?: Date,
    limit?: number
  ) {
    return this.repository.getHistoricalDensity(tenantId, branchId, zoneId, fromDate, toDate, limit);
  }

  public getHistoricalQueueMetrics(
    tenantId: string,
    branchId?: string,
    queueId?: string,
    fromDate?: Date,
    toDate?: Date,
    limit?: number
  ) {
    return this.repository.getHistoricalQueueMetrics(tenantId, branchId, queueId, fromDate, toDate, limit);
  }

  public listIncidents(filter: ListIncidentsFilter) {
    return this.repository.listIncidents(filter);
  }

  public getIncidentById(id: string, tenantId: string) {
    return this.repository.getIncidentById(id, tenantId);
  }

  public reviewIncident(
    id: string,
    tenantId: string,
    reviewStatus: IncidentReviewStatus,
    reviewedBy: string,
    resolutionNotes?: string
  ) {
    return this.repository.reviewIncident(id, tenantId, reviewStatus, reviewedBy, resolutionNotes);
  }

  public getStats(tenantId: string, branchId?: string) {
    return this.repository.getCrowdStats(tenantId, branchId);
  }

  public getConfig(tenantId: string) {
    return this.repository.getConfig(tenantId);
  }

  public upsertConfig(config: Omit<CrowdQueueConfigRecord, 'created_at' | 'updated_at'>) {
    return this.repository.upsertConfig(config);
  }
}
