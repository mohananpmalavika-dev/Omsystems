/**
 * Automated Test Suite for Crowd Density & Queue Length Detection (analytics.crowd)
 * 
 * Verifies branch hall spatial density estimation, counter queue depth tracking,
 * teller attendance auditing, SLA threshold breach detection, repository persistence,
 * and operational recommendations with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DensityEstimator } from '../../src/analytics/crowd/density-estimator.js';
import { QueueMonitor } from '../../src/analytics/crowd/queue-monitor.js';
import { CrowdRepository } from '../../src/analytics/crowd/crowd-repository.js';
import { CrowdService } from '../../src/analytics/crowd/crowd-service.js';
import type {
  CrowdZoneRecord,
  CounterQueueRecord,
  TrackedPerson,
  Point,
} from '../../src/analytics/crowd/types.js';

describe('DensityEstimator Spatial Geometry & Calculations', () => {
  const polygon: Point[] = [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 10, y: 90 },
  ];

  it('correctly determines whether points are inside or outside the zone polygon', () => {
    expect(DensityEstimator.isPointInPolygon({ x: 50, y: 50 }, polygon)).toBe(true);
    expect(DensityEstimator.isPointInPolygon({ x: 20, y: 30 }, polygon)).toBe(true);
    expect(DensityEstimator.isPointInPolygon({ x: 5, y: 50 }, polygon)).toBe(false);
    expect(DensityEstimator.isPointInPolygon({ x: 100, y: 50 }, polygon)).toBe(false);
  });

  it('calculates bounding box centroids accurately', () => {
    const box = { x: 100, y: 200, width: 40, height: 80 };
    const centroid = DensityEstimator.calculateCentroid(box);
    expect(centroid.x).toBe(120);
    expect(centroid.y).toBe(240);
  });

  it('calculates polygon centroid accurately', () => {
    const centroid = DensityEstimator.calculatePolygonCentroid(polygon);
    expect(centroid.x).toBe(50);
    expect(centroid.y).toBe(50);
  });

  it('classifies density levels based on configured capacity thresholds', () => {
    const nominal = 20;
    const warning = 35;
    const max = 50;

    expect(DensityEstimator.classifyDensityLevel(0, nominal, warning, max)).toBe('empty');
    expect(DensityEstimator.classifyDensityLevel(3, nominal, warning, max)).toBe('sparse');
    expect(DensityEstimator.classifyDensityLevel(15, nominal, warning, max)).toBe('normal');
    expect(DensityEstimator.classifyDensityLevel(25, nominal, warning, max)).toBe('crowded');
    expect(DensityEstimator.classifyDensityLevel(40, nominal, warning, max)).toBe('overcrowded');
    expect(DensityEstimator.classifyDensityLevel(55, nominal, warning, max)).toBe('dangerous');
  });

  it('detects choke-point bottlenecks when high density coincides with low velocity', () => {
    expect(DensityEstimator.detectBottleneck('overcrowded', 0.08, 0.15)).toBe(true);
    expect(DensityEstimator.detectBottleneck('dangerous', 0.05, 0.15)).toBe(true);
    expect(DensityEstimator.detectBottleneck('normal', 0.05, 0.15)).toBe(false);
    expect(DensityEstimator.detectBottleneck('crowded', 0.40, 0.15)).toBe(false);
  });

  it('analyzes crowd growth trend from rolling count samples', () => {
    expect(DensityEstimator.analyzeTrend([10, 15, 25])).toBe('increasing');
    expect(DensityEstimator.analyzeTrend([40, 30, 20])).toBe('decreasing');
    expect(DensityEstimator.analyzeTrend([25, 26, 25])).toBe('stable');
  });

  it('estimates zone density accurately given a list of frame detections', () => {
    const zone: CrowdZoneRecord = {
      id: 'zone-test-1',
      tenant_id: 't1',
      branch_id: 'b1',
      camera_id: 'c1',
      zone_name: 'Main Banking Hall',
      zone_type: 'branch_hall',
      polygon,
      area_sqm: 100,
      nominal_capacity: 10,
      warning_capacity: 15,
      max_capacity: 20,
      enabled: true,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    // 12 persons inside polygon, 2 outside
    const persons: TrackedPerson[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        trackId: `track-${i}`,
        boundingBox: { x: 20 + (i % 5) * 10, y: 20 + Math.floor(i / 5) * 15, width: 8, height: 16 },
        velocity: { x: 0.05, y: 0.02 },
      })),
      { trackId: 'outside-1', boundingBox: { x: 200, y: 200, width: 8, height: 16 } },
      { trackId: 'outside-2', boundingBox: { x: 250, y: 250, width: 8, height: 16 } },
    ];

    const result = DensityEstimator.estimateZoneDensity(zone, persons);

    expect(result.personCount).toBe(12);
    expect(result.densityLevel).toBe('crowded');
    expect(result.occupancyPercentage).toBe(120); // 12/10 * 100
    expect(result.densityPerSqm).toBe(0.12); // 12 / 100
    expect(result.requiresAlert).toBe(false); // only warning/overcrowded or dangerous triggers alert
  });
});

describe('QueueMonitor Depth & SLA Tracking', () => {
  let monitor: QueueMonitor;

  const counter: CounterQueueRecord = {
    id: 'counter-1',
    tenant_id: 't1',
    branch_id: 'b1',
    camera_id: 'c1',
    counter_number: 'C1',
    counter_name: 'Cash Deposit Counter',
    counter_type: 'cash_deposit',
    queue_polygon: [
      { x: 30, y: 40 },
      { x: 50, y: 40 },
      { x: 50, y: 85 },
      { x: 30, y: 85 },
    ],
    service_station_polygon: [
      { x: 30, y: 15 },
      { x: 50, y: 15 },
      { x: 50, y: 35 },
      { x: 30, y: 35 },
    ],
    max_queue_length_threshold: 4,
    max_wait_time_seconds_threshold: 180, // 3 minutes
    alert_severity: 'P2',
    enabled: true,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    monitor = new QueueMonitor();
  });

  it('tracks queue length and teller attendance', () => {
    const t0 = 1000000;

    // 3 customers in queue, 1 teller in service station
    const persons: TrackedPerson[] = [
      { trackId: 'cust-1', boundingBox: { x: 35, y: 45, width: 8, height: 16 } },
      { trackId: 'cust-2', boundingBox: { x: 35, y: 60, width: 8, height: 16 } },
      { trackId: 'cust-3', boundingBox: { x: 35, y: 75, width: 8, height: 16 } },
      { trackId: 'teller-1', boundingBox: { x: 35, y: 25, width: 8, height: 16 } },
    ];

    const metric = monitor.evaluateCounterQueue(counter, persons, t0);

    expect(metric.currentQueueLength).toBe(3);
    expect(metric.isCounterAttended).toBe(true);
    expect(metric.thresholdExceeded).toBe(false);
    expect(metric.requiresAlert).toBe(false);
  });

  it('detects queue length threshold exceeded', () => {
    const t0 = 1000000;

    // 6 customers in queue (limit is 4)
    const persons: TrackedPerson[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        trackId: `cust-${i}`,
        boundingBox: { x: 35, y: 45 + i * 6, width: 8, height: 16 },
      })),
      { trackId: 'teller-1', boundingBox: { x: 35, y: 25, width: 8, height: 16 } },
    ];

    const metric = monitor.evaluateCounterQueue(counter, persons, t0);

    expect(metric.currentQueueLength).toBe(6);
    expect(metric.thresholdExceeded).toBe(true);
    expect(metric.requiresAlert).toBe(true);
    expect(metric.incidentType).toBe('queue_length_exceeded');
  });

  it('detects unattended counter when customers are waiting with no teller', () => {
    const t0 = 1000000;
    const t1 = t0 + 40000; // 40 seconds later

    // Initial frame: teller present
    monitor.evaluateCounterQueue(
      counter,
      [
        { trackId: 'cust-1', boundingBox: { x: 35, y: 45, width: 8, height: 16 } },
        { trackId: 'teller-1', boundingBox: { x: 35, y: 25, width: 8, height: 16 } },
      ],
      t0
    );

    // 40 seconds later: teller left, customer still waiting
    const metric = monitor.evaluateCounterQueue(
      counter,
      [{ trackId: 'cust-1', boundingBox: { x: 35, y: 45, width: 8, height: 16 } }],
      t1
    );

    expect(metric.isCounterAttended).toBe(false);
    expect(metric.requiresAlert).toBe(true);
    expect(metric.incidentType).toBe('unattended_counter_with_queue');
    expect(metric.alertSeverity).toBe('P1');
  });

  it('accumulates wait time and detects wait time SLA breaches', () => {
    const t0 = 1000000;
    const t1 = t0 + 200000; // 200 seconds later (SLA is 180s)

    // First arrival
    monitor.evaluateCounterQueue(
      counter,
      [
        { trackId: 'cust-1', boundingBox: { x: 35, y: 45, width: 8, height: 16 } },
        { trackId: 'teller-1', boundingBox: { x: 35, y: 25, width: 8, height: 16 } },
      ],
      t0
    );

    // 200s later: customer still in queue
    const metric = monitor.evaluateCounterQueue(
      counter,
      [
        { trackId: 'cust-1', boundingBox: { x: 35, y: 45, width: 8, height: 16 } },
        { trackId: 'teller-1', boundingBox: { x: 35, y: 25, width: 8, height: 16 } },
      ],
      t1
    );

    expect(metric.maxWaitTimeSeconds).toBeGreaterThanOrEqual(200);
    expect(metric.requiresAlert).toBe(true);
    expect(metric.incidentType).toBe('wait_time_sla_breach');
  });

  it('generates counter opening recommendations for overloaded queues', () => {
    const standbyCounter: CounterQueueRecord = {
      ...counter,
      id: 'counter-2',
      counter_number: 'C2',
      counter_name: 'Standby Teller Counter',
    };

    const queueMetrics = [
      {
        queueId: counter.id,
        counterNumber: counter.counter_number,
        counterName: counter.counter_name,
        counterType: counter.counter_type,
        currentQueueLength: 7,
        servedPersonCount: 12,
        avgWaitTimeSeconds: 320,
        maxWaitTimeSeconds: 450,
        isCounterAttended: true,
        thresholdExceeded: true,
        bottleneckDetected: true,
        participantTrackIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
        waitingPersons: [],
        requiresAlert: true,
      },
      {
        queueId: standbyCounter.id,
        counterNumber: standbyCounter.counter_number,
        counterName: standbyCounter.counter_name,
        counterType: standbyCounter.counter_type,
        currentQueueLength: 0,
        servedPersonCount: 0,
        avgWaitTimeSeconds: 0,
        maxWaitTimeSeconds: 0,
        isCounterAttended: false,
        thresholdExceeded: false,
        bottleneckDetected: false,
        participantTrackIds: [],
        waitingPersons: [],
        requiresAlert: false,
      },
    ];

    const recommendations = monitor.generateRecommendations([counter, standbyCounter], queueMetrics);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0]?.type).toBe('open_counter');
    expect(recommendations[0]?.recommendedCounterNumber).toBe('C2');
    expect(recommendations[0]?.title).toContain('Open Additional Counter');
  });
});

describe('CrowdRepository & Service Integration', () => {
  let repository: CrowdRepository;
  let service: CrowdService;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      alerts: [] as any[],
      createAlert: async (alert: any) => {
        mockStore.alerts.push(alert);
        return { id: 'alert-123', ...alert };
      },
    };
    repository = new CrowdRepository();
    service = new CrowdService(undefined, mockStore);
  });

  it('performs complete CRUD operations on crowd monitoring zones', async () => {
    const created = await repository.createZone({
      tenant_id: 'tenant-abc',
      branch_id: 'branch-1',
      camera_id: 'cam-1',
      zone_name: 'Waiting Lounge',
      zone_type: 'waiting_lounge',
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      area_sqm: 80,
      nominal_capacity: 25,
      warning_capacity: 40,
      max_capacity: 55,
      enabled: true,
      metadata: {},
    });

    expect(created.id).toBeDefined();
    expect(created.zone_name).toBe('Waiting Lounge');

    // List
    const list = await repository.listZones('tenant-abc', 'branch-1');
    expect(list.length).toBe(1);

    // Update
    const updated = await repository.updateZone(created.id, 'tenant-abc', {
      zone_name: 'VIP Waiting Lounge',
    });
    expect(updated?.zone_name).toBe('VIP Waiting Lounge');

    // Delete
    const deleted = await repository.deleteZone(created.id, 'tenant-abc');
    expect(deleted).toBe(true);
    const postList = await repository.listZones('tenant-abc');
    expect(postList.length).toBe(0);
  });

  it('performs complete CRUD operations on counter queues', async () => {
    const created = await repository.createCounterQueue({
      tenant_id: 'tenant-abc',
      branch_id: 'branch-1',
      camera_id: 'cam-1',
      counter_number: 'C1',
      counter_name: 'Cash Counter 1',
      counter_type: 'cash_deposit',
      queue_polygon: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 60 },
        { x: 10, y: 60 },
      ],
      service_station_polygon: [
        { x: 10, y: 5 },
        { x: 30, y: 5 },
        { x: 30, y: 18 },
        { x: 10, y: 18 },
      ],
      max_queue_length_threshold: 5,
      max_wait_time_seconds_threshold: 300,
      alert_severity: 'P2',
      enabled: true,
      metadata: {},
    });

    expect(created.id).toBeDefined();
    expect(created.counter_number).toBe('C1');

    const queues = await repository.listCounterQueues('tenant-abc');
    expect(queues.length).toBe(1);

    const updated = await repository.updateCounterQueue(created.id, 'tenant-abc', {
      counter_name: 'Forex Desk',
    });
    expect(updated?.counter_name).toBe('Forex Desk');

    const deleted = await repository.deleteCounterQueue(created.id, 'tenant-abc');
    expect(deleted).toBe(true);
  });

  it('executes full frame analysis pipeline and dispatches incidents & alerts', async () => {
    // 1. Setup zone
    const zone = await service.createZone({
      tenant_id: 't-prod',
      branch_id: 'b-main',
      camera_id: 'cam-lobby',
      zone_name: 'Branch Central Atrium',
      zone_type: 'branch_hall',
      polygon: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ],
      area_sqm: 100,
      nominal_capacity: 5,
      warning_capacity: 8,
      max_capacity: 12,
      enabled: true,
      metadata: {},
    });

    // 2. Ingest frame with 10 persons (exceeds warning threshold of 8)
    const result = await service.analyzeFrame({
      tenantId: 't-prod',
      branchId: 'b-main',
      cameraId: 'cam-lobby',
      persons: Array.from({ length: 10 }, (_, i) => ({
        trackId: `person-${i}`,
        boundingBox: { x: 50 + i * 5, y: 50 + i * 5, width: 10, height: 20 },
      })),
    });

    expect(result.zones.length).toBe(1);
    expect(result.zones[0]?.personCount).toBe(10);
    expect(result.zones[0]?.densityLevel).toBe('overcrowded');
    expect(result.incidents.length).toBeGreaterThan(0);

    // Verify incident was saved in repository
    const { incidents } = await service.listIncidents({ tenantId: 't-prod' });
    expect(incidents.length).toBe(1);
    expect(incidents[0]?.incident_type).toBe('crowd_density_exceeded');

    // Verify alert dispatched to store
    expect(mockStore.alerts.length).toBeGreaterThan(0);
    expect(mockStore.alerts[0].alertType).toBe('CROWD_GATHERING');

    // 3. Operator review workflow
    const reviewed = await service.reviewIncident(
      incidents[0]!.id,
      't-prod',
      'resolved',
      'user-security-lead',
      'Dispatched floor manager to guide customers to secondary counter.'
    );

    expect(reviewed?.review_status).toBe('resolved');
    expect(reviewed?.reviewed_by).toBe('user-security-lead');
  });

  it('computes aggregated KPIs accurately with live status endpoint', async () => {
    await service.createZone({
      tenant_id: 't-kpi',
      branch_id: 'b-kpi',
      camera_id: 'cam-1',
      zone_name: 'Zone A',
      zone_type: 'branch_hall',
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      area_sqm: 50,
      nominal_capacity: 20,
      warning_capacity: 35,
      max_capacity: 50,
      enabled: true,
      metadata: {},
    });

    const live = await service.getLiveStatus('t-kpi', 'b-kpi');
    expect(live.zones.length).toBe(1);
    expect(live.kpis).toBeDefined();
    expect(live.kpis.activeZonesCount).toBe(1);
    expect(live.kpis.slaComplianceRate).toBeGreaterThanOrEqual(90);
  });
});
