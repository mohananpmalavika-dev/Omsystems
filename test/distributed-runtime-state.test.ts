import { describe, it, expect } from 'vitest';
import {
  DistributedLeaseService,
  CameraOwnershipService,
  AlertDeduplicationService,
  RecordingWriterOwnershipService,
  ClusterStateService,
} from '../src/distributed-state/index.js';

describe('Distributed Runtime State & Leases Subsystem (Eliminating Critical In-Memory Maps)', () => {
  it('manages atomic distributed leases with monotonic fencing tokens and safe renewal', () => {
    const leaseService = new DistributedLeaseService();
    const leaseKey = 'stream:lease:CAM-14:main';

    // 1. Node A acquires lease
    const leaseA = leaseService.acquireLease({
      key: leaseKey,
      ownerId: 'gateway-node-01',
      ttlMs: 5000,
    });
    expect(leaseA).not.toBeNull();
    expect(leaseA?.ownerId).toBe('gateway-node-01');
    expect(leaseA?.fencingToken).toBeGreaterThanOrEqual(1000);

    // 2. Node B attempts to acquire same active lease -> Collision Rejected
    const leaseB = leaseService.acquireLease({
      key: leaseKey,
      ownerId: 'gateway-node-02',
      ttlMs: 5000,
    });
    expect(leaseB).toBeNull();

    // 3. Node A renews lease (extending TTL from 5000ms to 8000ms)
    const initialExpiresAt = leaseA!.expiresAt;
    const renewed = leaseService.renewLease(leaseKey, 'gateway-node-01', leaseA!.token, 8000);
    expect(renewed).not.toBeNull();
    expect(renewed?.expiresAt).toBeGreaterThan(initialExpiresAt);

    // 4. Stolen renewal attempt with wrong token -> Fails
    const fakeRenew = leaseService.renewLease(leaseKey, 'gateway-node-01', 'fake-token');
    expect(fakeRenew).toBeNull();

    // 5. Safe release
    const released = leaseService.releaseLease(leaseKey, 'gateway-node-01', leaseA!.token);
    expect(released).toBe(true);

    // 6. After release, Node B can acquire with a higher monotonic fencing token
    const leaseBAfterRelease = leaseService.acquireLease({
      key: leaseKey,
      ownerId: 'gateway-node-02',
      ttlMs: 5000,
    });
    expect(leaseBAfterRelease).not.toBeNull();
    expect(leaseBAfterRelease?.ownerId).toBe('gateway-node-02');
    expect(leaseBAfterRelease!.fencingToken).toBeGreaterThan(leaseA!.fencingToken);
  });

  it('manages camera ownership leases, preventing competing polling across edge instances', () => {
    const leaseService = new DistributedLeaseService();
    const cameraService = new CameraOwnershipService(leaseService);

    // Edge Agent 1 acquires CAM-VAULT-01
    const ownership1 = cameraService.acquireCamera('CAM-VAULT-01', 'edge-agent-east-01', 10000);
    expect(ownership1).not.toBeNull();
    expect(ownership1?.ownerNodeId).toBe('edge-agent-east-01');
    expect(ownership1?.status).toBe('ACTIVE');

    // Edge Agent 2 attempts acquisition -> Refused
    const ownership2 = cameraService.acquireCamera('CAM-VAULT-01', 'edge-agent-west-02', 10000);
    expect(ownership2).toBeNull();

    // Query active owner
    const currentOwner = cameraService.getCameraOwner('CAM-VAULT-01');
    expect(currentOwner?.ownerNodeId).toBe('edge-agent-east-01');
  });

  it('deduplicates incoming P1 alerts across cluster workers using sliding TTL windows', () => {
    const alertDedup = new AlertDeduplicationService();

    const alertInput = {
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-VAULT-01',
      eventType: 'P1_VAULT_INTRUSION',
      severity: 'CRITICAL',
      windowMs: 5000,
    };

    // 1. First alert -> New Unique Alert
    const res1 = alertDedup.checkAndRecordAlert(alertInput);
    expect(res1.isDuplicate).toBe(false);
    expect(res1.occurrenceCount).toBe(1);

    // 2. Second alert 50ms later on same camera/event -> Marked Duplicate
    const res2 = alertDedup.checkAndRecordAlert(alertInput);
    expect(res2.isDuplicate).toBe(true);
    expect(res2.occurrenceCount).toBe(2);

    // 3. Third alert on a DIFFERENT camera -> New Unique Alert
    const res3 = alertDedup.checkAndRecordAlert({
      ...alertInput,
      cameraId: 'CAM-LOBBY-02',
    });
    expect(res3.isDuplicate).toBe(false);
    expect(res3.occurrenceCount).toBe(1);
  });

  it('enforces recording writer ownership and split-brain protection via fencing tokens', () => {
    const leaseService = new DistributedLeaseService();
    const writerService = new RecordingWriterOwnershipService(leaseService);

    // Recorder 1 acquires writer lease
    const lease1 = writerService.acquireWriterLease('CAM-ATM-01', 'recorder-node-01', 'POOL-01', 10000);
    expect(lease1).not.toBeNull();
    expect(lease1?.fencingToken).toBeDefined();

    // Write operation with valid token -> Allowed
    const isValidWrite = writerService.validateWriteOperation('CAM-ATM-01', 'recorder-node-01', lease1!.fencingToken);
    expect(isValidWrite).toBe(true);

    // Write operation with stale / lower fencing token or wrong node -> Rejected
    const isStaleWrite = writerService.validateWriteOperation('CAM-ATM-01', 'recorder-node-01', lease1!.fencingToken - 10);
    expect(isStaleWrite).toBe(false);

    const isWrongNode = writerService.validateWriteOperation('CAM-ATM-01', 'recorder-node-99', lease1!.fencingToken);
    expect(isWrongNode).toBe(false);
  });

  it('maintains cluster node registry, heartbeats, workload balancing, and dead node reaping', () => {
    const clusterService = new ClusterStateService();

    // Register Media Gateways with different workloads
    clusterService.registerHeartbeat({
      nodeId: 'gw-01',
      nodeType: 'MEDIA_GATEWAY',
      address: '10.0.1.10:8080',
      heartbeatTtlMs: 20000,
    });
    clusterService.adjustWorkload('gw-01', 15); // 15 active streams

    clusterService.registerHeartbeat({
      nodeId: 'gw-02',
      nodeType: 'MEDIA_GATEWAY',
      address: '10.0.1.11:8080',
      heartbeatTtlMs: 20000,
    });
    clusterService.adjustWorkload('gw-02', 3); // 3 active streams (optimal)

    // Select optimal media gateway for new stream session -> Picks gw-02 (lowest workload)
    const optimalGw = clusterService.selectOptimalNode('MEDIA_GATEWAY');
    expect(optimalGw?.nodeId).toBe('gw-02');
    expect(optimalGw?.assignedWorkload).toBe(3);

    // Register an Edge Agent with 1ms TTL (simulating dead node)
    clusterService.registerHeartbeat({
      nodeId: 'edge-failing-01',
      nodeType: 'EDGE_AGENT',
      address: '192.168.1.50',
      heartbeatTtlMs: -100, // Already expired
    });

    // Reap dead nodes
    const deadList = clusterService.reapDeadNodes();
    expect(deadList.some((d) => d.nodeId === 'edge-failing-01')).toBe(true);

    const deadNode = clusterService.getNode('edge-failing-01');
    expect(deadNode?.status).toBe('DEAD');
  });
});
