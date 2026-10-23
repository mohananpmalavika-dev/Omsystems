/**
 * Automated Test Suite for Smart Edge Offline Mesh & Zero-Bandwidth Mode (Bandwidth Killer)
 *
 * Verifies Quiescent 1 FPS stream throttling, AI-triggered 4K burst streaming,
 * mathematical 70%+ bandwidth cost reduction, Anti-Jamming local cache survivability,
 * store-and-forward zero-duplicate-frame sync, and Fastify REST API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  calculateBandwidthSavings,
  type EdgeBandwidthPolicy,
} from '../../src/edge-mesh/domain/edge-mesh.types.js';
import { EdgeMeshRepository } from '../../src/edge-mesh/repositories/edge-mesh.repository.js';
import { ZeroBandwidthControllerService } from '../../src/edge-mesh/services/zero-bandwidth-controller.service.js';
import { AntiJammingMeshService } from '../../src/edge-mesh/services/anti-jamming-mesh.service.js';
import { registerEdgeMeshRoutes } from '../../src/routes/edge-mesh.routes.js';

describe('Bandwidth Killer Mathematical Formulas & Quiescent Stream Contracts', () => {
  it('calculates expected 70%+ bandwidth reduction correctly', () => {
    // Standard continuous unoptimized 1080p: ~3500 kbps for 1 hour = ~1.575 GB
    const unoptimizedBytes = 1_575_000_000;
    // Zero-Bandwidth mode: 1 FPS keyframes (~40 kbps) for 58 mins + 2 mins 4K burst = ~130 MB
    const actualBytes = 130_000_000;

    const savings = calculateBandwidthSavings(actualBytes, unoptimizedBytes);
    expect(savings).toBeGreaterThanOrEqual(70.0);
    expect(savings).toBeCloseTo(91.7, 1);
  });

  it('clamps bandwidth savings gracefully for edge cases', () => {
    expect(calculateBandwidthSavings(0, 0)).toBe(75.0);
    expect(calculateBandwidthSavings(100, 100)).toBe(0);
  });
});

describe('Zero-Bandwidth Controller & AI-Triggered 4K Burst Engine', () => {
  let repository: EdgeMeshRepository;
  let service: ZeroBandwidthControllerService;

  beforeEach(() => {
    repository = new EdgeMeshRepository();
    service = new ZeroBandwidthControllerService(repository);
  });

  it('initializes cameras in Quiescent 1 FPS mode by default', async () => {
    const state = await service.getCameraStreamState('tenant-01', 'cam-front-entrance');

    expect(state.currentMode).toBe('QUIESCENT_1FPS');
    expect(state.currentFps).toBe(1.0);
    expect(state.currentBitrateKbps).toBe(40);
    expect(state.currentResolution).toBe('240p');
    expect(state.isBurstActive).toBe(false);
  });

  it('instantly bursts to 4K / 30 FPS when a qualified AI alert triggers', async () => {
    const res = await service.handleAlertTrigger({
      tenantId: 'tenant-01',
      branchId: 'branch-south',
      cameraId: 'cam-vault-main',
      alertId: 'alert-helmet-99',
      alertType: 'no_helmet_detected',
    });

    expect(res.burstActivated).toBe(true);
    expect(res.state.currentMode).toBe('BURST_4K');
    expect(res.state.currentFps).toBe(30);
    expect(res.state.currentResolution).toBe('4K');
    expect(res.state.currentBitrateKbps).toBe(4500);
    expect(res.state.isBurstActive).toBe(true);
    expect(res.state.burstRemainingSeconds).toBe(30);
    expect(res.state.triggerAlertType).toBe('no_helmet_detected');
  });

  it('ignores unqualified non-security alerts and remains in 1 FPS mode', async () => {
    const res = await service.handleAlertTrigger({
      tenantId: 'tenant-01',
      branchId: 'branch-south',
      cameraId: 'cam-parking-lot',
      alertId: 'alert-heartbeat-01',
      alertType: 'routine_cloud_ping',
    });

    expect(res.burstActivated).toBe(false);
    expect(res.state.currentMode).toBe('QUIESCENT_1FPS');
    expect(res.state.currentFps).toBe(1.0);
  });

  it('ramps down to 1 FPS quiescent mode when burst expires', () => {
    const policy: EdgeBandwidthPolicy = {
      id: 'pol-1',
      tenant_id: 'tenant-01',
      name: 'Test Policy',
      enabled: true,
      quiescent_fps: 1.0,
      quiescent_resolution: '240p',
      quiescent_bitrate_kbps: 40,
      burst_fps: 30,
      burst_resolution: '4K',
      burst_bitrate_kbps: 4500,
      burst_duration_seconds: 30,
      pre_buffer_seconds: 10,
      trigger_alert_types: ['intrusion'],
      monthly_data_quota_mb: 50000,
      created_at: new Date(),
      updated_at: new Date(),
    };

    service.rampDownToQuiescent('cam-vault-main', policy);
    void service.getCameraStreamState('tenant-01', 'cam-vault-main').then((state) => {
      expect(state.currentMode).toBe('QUIESCENT_1FPS');
      expect(state.isBurstActive).toBe(false);
    });
  });

  it('supports security operator manual override from NOC', async () => {
    const state = await service.setOperatorOverride('tenant-01', 'cam-gate-01', true);
    expect(state.currentMode).toBe('OPERATOR_OVERRIDE');
    expect(state.currentFps).toBe(30);

    const reverted = await service.setOperatorOverride('tenant-01', 'cam-gate-01', false);
    expect(reverted.currentMode).toBe('QUIESCENT_1FPS');
  });
});

describe('Anti-Jamming Mesh & Local Cache Survivability', () => {
  let repository: EdgeMeshRepository;
  let service: AntiJammingMeshService;

  beforeEach(() => {
    repository = new EdgeMeshRepository();
    service = new AntiJammingMeshService(repository);
  });

  it('enters autonomous isolation mode during WAN cable cut / jammer', async () => {
    const res = await service.handleWanIsolation({
      branchId: 'branch-kochi-central',
      reason: 'WAN_FIBER_CUT_JAMMING_ACTIVE',
    });

    expect(res.antiJammingActive).toBe(true);
    expect(res.localRecordingActive).toBe(true);
    expect(res.localAiAnalyticsActive).toBe(true);
    expect(res.node.status).toBe('OFFLINE_ISOLATED');

    const pending = await repository.listPendingCacheItems('branch-kochi-central');
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending[0].priority).toBe(100); // P1 high severity alert spooled first
  });

  it('performs store-and-forward synchronization with zero duplicate frames upon WAN restoration', async () => {
    // 1. Trigger outage and local caching
    await service.handleWanIsolation({ branchId: 'branch-alappuzha-east' });

    // 2. Trigger link restoration
    const restoreRes = await service.handleWanRestoration('branch-alappuzha-east');

    expect(restoreRes.syncedItemsCount).toBeGreaterThanOrEqual(2);
    expect(restoreRes.bytesSynced).toBeGreaterThan(0);
    expect(restoreRes.duplicateFramesPrevented).toBeGreaterThanOrEqual(1800);
    expect(restoreRes.node.status).toBe('ONLINE');
    expect(restoreRes.node.anti_jamming_active).toBe(false);

    // Verify all items marked synced
    const remaining = await repository.listPendingCacheItems('branch-alappuzha-east');
    expect(remaining).toHaveLength(0);
  });
});

describe('Smart Edge Mesh Fastify REST API Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    const mockStore: any = {
      pool: undefined, // in-memory deterministic store
    };
    await registerEdgeMeshRoutes(app, mockStore);
    await app.ready();
  });

  it('lists existing bandwidth policies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/edge-mesh/policies',
      headers: { 'x-tenant-id': 'tenant-test' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.data[0].quiescent_fps).toBe(1.0);
  });

  it('creates and retrieves a new bandwidth policy', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/edge-mesh/policies',
      headers: { 'x-tenant-id': 'tenant-test' },
      payload: {
        name: 'Remote Branch VSAT 1 FPS Saver',
        quiescentFps: 0.5,
        quiescentBitrateKbps: 25,
        burstFps: 25,
        burstResolution: '1080p',
        burstDurationSeconds: 20,
        triggerAlertTypes: ['intrusion', 'no_helmet_detected'],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.success).toBe(true);
    expect(body.data.quiescent_fps).toBe(0.5);
  });

  it('queries camera stream state and triggers 4K burst over REST API', async () => {
    // 1. Initial State: Quiescent 1 FPS
    const stateRes = await app.inject({
      method: 'GET',
      url: '/v1/edge-mesh/stream-state/cam-test-api',
      headers: { 'x-tenant-id': 'default-tenant' },
    });
    expect(stateRes.statusCode).toBe(200);
    expect(JSON.parse(stateRes.body).data.currentMode).toBe('QUIESCENT_1FPS');

    // 2. Trigger 4K Burst
    const burstRes = await app.inject({
      method: 'POST',
      url: '/v1/edge-mesh/trigger-burst',
      headers: { 'x-tenant-id': 'default-tenant' },
      payload: {
        cameraId: 'cam-test-api',
        alertType: 'intrusion',
      },
    });
    expect(burstRes.statusCode).toBe(200);
    const burstBody = JSON.parse(burstRes.body);
    expect(burstBody.data.burstActivated).toBe(true);
    expect(burstBody.data.state.currentMode).toBe('BURST_4K');
  });

  it('simulates WAN isolation and restoration over REST API', async () => {
    // 1. Simulate Cable Cut
    const cutRes = await app.inject({
      method: 'POST',
      url: '/v1/edge-mesh/simulate-wan-isolation',
      headers: { 'x-tenant-id': 'default-tenant' },
      payload: {
        branchId: 'branch-calicut-north',
        reason: 'OPTICAL_FIBER_CUT',
      },
    });
    expect(cutRes.statusCode).toBe(200);
    expect(JSON.parse(cutRes.body).data.antiJammingActive).toBe(true);

    // 2. Simulate Restoration
    const restoreRes = await app.inject({
      method: 'POST',
      url: '/v1/edge-mesh/simulate-wan-restoration',
      headers: { 'x-tenant-id': 'default-tenant' },
      payload: {
        branchId: 'branch-calicut-north',
      },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).data.duplicateFramesPrevented).toBeGreaterThan(0);
  });

  it('fetches bandwidth savings and ROI metrics', async () => {
    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/edge-mesh/bandwidth-stats',
      headers: { 'x-tenant-id': 'default-tenant' },
    });

    expect(statsRes.statusCode).toBe(200);
    const body = JSON.parse(statsRes.body);
    expect(body.success).toBe(true);
    expect(body.data.averageDataSavingsPercentage).toBeGreaterThanOrEqual(70.0);
    expect(body.data.estimatedMonthlyCostSavingsInr).toBeGreaterThan(0);
  });
});
