import { describe, it, expect } from 'vitest';
import {
  LocalEdgeSurvivabilityService,
  StoreAndForwardOutboxService,
  CloudSyncReplayerService,
} from '../src/offline-sync/index.js';

describe('Offline Edge Survivability & Store-and-Forward Synchronization Subsystem', () => {
  it('operates 100% autonomously during WAN outage without cloud connectivity', () => {
    const outbox = new StoreAndForwardOutboxService();
    const survivability = new LocalEdgeSurvivabilityService(outbox);
    const branchId = 'BR-118';

    // 1. WAN connection drops
    survivability.setConnectivityState('OFFLINE');
    expect(survivability.getConnectivityState()).toBe('OFFLINE');

    // 2. Continuous local video recording continues writing to local disks
    survivability.recordLocalSegment(branchId, {
      cameraId: 'CAM-VAULT-01',
      segmentId: 'SEG-OFFLINE-001',
      startTime: '2026-08-17T17:00:00.000Z',
      endTime: '2026-08-17T17:15:00.000Z',
      storagePath: '/mnt/local-nvme/recordings/CAM-VAULT-01_170000.mp4',
      sizeBytes: 125_000_000,
      sha256: 'a'.repeat(64),
      keyframeCount: 450,
    });

    // 3. Local autonomous health monitoring continues
    survivability.recordLocalHealth(branchId, {
      cameraId: 'CAM-VAULT-01',
      cpuPct: 32,
      memoryPct: 45,
      diskUsedPct: 62,
      fps: 25.0,
      packetLossPct: 0.0,
      temperatureCelsius: 41.5,
    });

    // 4. Local AI detection & access badge swipes continue
    survivability.recordOperationalEvent(branchId, {
      eventType: 'PERSON_DETECTED_AFTER_HOURS',
      cameraId: 'CAM-VAULT-01',
      confidence: 0.96,
    });

    // 5. Local operator audits continue
    survivability.recordAuditLog(branchId, {
      actor: 'local-guard-ravi',
      action: 'PTZ_PAN_VAULT_DOOR',
      target: 'CAM-VAULT-01',
    });

    // 6. Local P1 intrusion alarm triggers
    survivability.triggerP1Incident(branchId, {
      incidentType: 'VAULT_DOOR_TAMPER',
      cameraId: 'CAM-VAULT-01',
      severity: 'P1_CRITICAL',
      reason: 'Physical vibration sensor triggered during outage',
    });

    const state = survivability.getBranchState(branchId, 'Mumbai Main Branch');
    expect(state.connectivityState).toBe('OFFLINE');
    expect(state.localRecordingActive).toBe(true);
    expect(state.localHealthMonitorActive).toBe(true);
    expect(state.totalQueuedItems).toBe(5);
    expect(state.backlogByType.P1_INCIDENTS).toBe(1);
    expect(state.backlogByType.RECORDING_METADATA).toBe(1);
    expect(state.backlogByType.AUDIT_LOGS).toBe(1);
    expect(state.backlogByType.OPERATIONAL_EVENTS).toBe(1);
    expect(state.backlogByType.HEALTH_TELEMETRY).toBe(1);
  });

  it('orders outbox queue strictly by priority (P1 Incidents > Recording Metadata > Audit > Events > Health)', () => {
    const outbox = new StoreAndForwardOutboxService();
    const branchId = 'BR-118';

    // Enqueue in arbitrary order
    outbox.enqueue(branchId, 'HEALTH_TELEMETRY', { cpuPct: 15 });
    outbox.enqueue(branchId, 'OPERATIONAL_EVENTS', { eventType: 'MOTION' });
    outbox.enqueue(branchId, 'P1_INCIDENTS', { severity: 'P1_CRITICAL', reason: 'Vault alarm' });
    outbox.enqueue(branchId, 'AUDIT_LOGS', { action: 'LOGIN' });
    outbox.enqueue(branchId, 'RECORDING_METADATA', { segmentId: 'SEG-101' });

    // Generate next sync batch
    const batch = outbox.nextBatch(branchId, 5);
    expect(batch).not.toBeNull();
    expect(batch?.items.length).toBe(5);

    // Verify ordering: P1 (100) -> METADATA (80) -> AUDIT (60) -> EVENTS (40) -> HEALTH (20)
    expect(batch?.items[0]?.type).toBe('P1_INCIDENTS');
    expect(batch?.items[0]?.priority).toBe(100);
    expect(batch?.items[1]?.type).toBe('RECORDING_METADATA');
    expect(batch?.items[1]?.priority).toBe(80);
    expect(batch?.items[2]?.type).toBe('AUDIT_LOGS');
    expect(batch?.items[2]?.priority).toBe(60);
    expect(batch?.items[3]?.type).toBe('OPERATIONAL_EVENTS');
    expect(batch?.items[3]?.priority).toBe(40);
    expect(batch?.items[4]?.type).toBe('HEALTH_TELEMETRY');
    expect(batch?.items[4]?.priority).toBe(20);
  });

  it('protects outbox quota by selectively evicting low-priority telemetry without dropping P1 alarms', () => {
    const outbox = new StoreAndForwardOutboxService(5); // Small quota of 5 items
    const branchId = 'BR-118';

    // Fill queue with 1 P1 incident, 1 audit log, and 3 health telemetry items
    outbox.enqueue(branchId, 'P1_INCIDENTS', { reason: 'Panic Button' });
    outbox.enqueue(branchId, 'AUDIT_LOGS', { action: 'CONFIG_CHANGE' });
    outbox.enqueue(branchId, 'HEALTH_TELEMETRY', { cpu: 1 });
    outbox.enqueue(branchId, 'HEALTH_TELEMETRY', { cpu: 2 });
    outbox.enqueue(branchId, 'HEALTH_TELEMETRY', { cpu: 3 });
    expect(outbox.getQueue(branchId).length).toBe(5);

    // Enqueue 2 more P1 incidents -> Queue must evict health telemetry, NOT P1 or audit
    outbox.enqueue(branchId, 'P1_INCIDENTS', { reason: 'Vault Door Breach' });
    outbox.enqueue(branchId, 'P1_INCIDENTS', { reason: 'Fire Alarm' });

    const currentQueue = outbox.getQueue(branchId);
    expect(currentQueue.length).toBe(5);

    const p1Count = currentQueue.filter((i) => i.type === 'P1_INCIDENTS').length;
    const auditCount = currentQueue.filter((i) => i.type === 'AUDIT_LOGS').length;
    const healthCount = currentQueue.filter((i) => i.type === 'HEALTH_TELEMETRY').length;

    expect(p1Count).toBe(3); // All 3 P1 incidents preserved
    expect(auditCount).toBe(1); // Audit preserved
    expect(healthCount).toBe(1); // Low priority telemetry evicted to make room
  });

  it('replays backlogs upon WAN reconnection, heals timeline gaps, and enforces idempotent deduplication', async () => {
    const outbox = new StoreAndForwardOutboxService();
    const survivability = new LocalEdgeSurvivabilityService(outbox);
    const replayer = new CloudSyncReplayerService(outbox, survivability);
    const branchId = 'BR-118';

    // 1. Outage occurs, spool 10 items
    survivability.setConnectivityState('OFFLINE');
    for (let i = 1; i <= 3; i++) {
      survivability.triggerP1Incident(branchId, { incidentType: 'P1', severity: 'P1_CRITICAL', reason: `Alarm ${i}` });
    }
    for (let i = 1; i <= 4; i++) {
      survivability.recordLocalSegment(branchId, {
        cameraId: 'CAM-01',
        segmentId: `SEG-OFFLINE-${i}`,
        startTime: `2026-08-17T17:0${i}:00Z`,
        endTime: `2026-08-17T17:0${i + 1}:00Z`,
        storagePath: `/mnt/nvme/${i}.mp4`,
        sizeBytes: 50_000_000,
        sha256: 'b'.repeat(64),
        keyframeCount: 150,
      });
    }
    for (let i = 1; i <= 3; i++) {
      survivability.recordLocalHealth(branchId, { cpuPct: 20 + i, memoryPct: 30, diskUsedPct: 50 });
    }

    expect(outbox.getQueue(branchId).length).toBe(10);

    // 2. WAN returns -> Replay backlogs
    const replayResult = await replayer.replayPendingBacklogs(branchId, 5);

    expect(replayResult.itemsSynced).toBe(10);
    expect(replayResult.healedGaps).toBe(4); // All 4 offline recorded segments healed in central index
    expect(replayResult.remainingInQueue).toBe(0);
    expect(survivability.getConnectivityState()).toBe('ONLINE');

    // 3. Central receiver stats
    const stats = replayer.getIngestedStats();
    expect(stats.totalIngested).toBe(10);
    expect(stats.byType.P1_INCIDENTS).toBe(3);
    expect(stats.byType.RECORDING_METADATA).toBe(4);
    expect(stats.byType.HEALTH_TELEMETRY).toBe(3);

    // 4. Retransmission / Idempotency Test: Sending an already synced batch reports duplicates
    const duplicateBatch = {
      batchId: 'dup-batch-01',
      branchId,
      generatedAt: new Date().toISOString(),
      itemCount: 1,
      checksum: 'dup-chk',
      items: [
        {
          id: 'item-already-ingested',
          branchId,
          type: 'P1_INCIDENTS' as const,
          priority: 100,
          payload: { reason: 'Duplicate' },
          timestamp: new Date().toISOString(),
          checksum: 'chk-1',
          retryCount: 0,
          status: 'QUEUED' as const,
        },
      ],
    };

    // First ingest -> Success
    const ack1 = replayer.ingestSyncBatch(duplicateBatch);
    expect(ack1.processedCount).toBe(1);
    expect(ack1.duplicateCount).toBe(0);

    // Second ingest of same batch -> Detected as Duplicate, 0 double-processing
    const ack2 = replayer.ingestSyncBatch(duplicateBatch);
    expect(ack2.processedCount).toBe(0);
    expect(ack2.duplicateCount).toBe(1);
    expect(ack2.status).toBe('SUCCESS');
  });
});
