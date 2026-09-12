import { describe, it, expect } from "vitest";
import { ClusterNodeArbiterService } from "../../src/ha/services/cluster-node-arbiter.service.js";
import { DisasterRecoveryService } from "../../src/ha/services/disaster-recovery.service.js";

describe("High Availability Clustering & Disaster Recovery", () => {
  it("manages node heartbeats, leader election, and epoch increment on node failure", async () => {
    const arbiter = new ClusterNodeArbiterService();

    // Register node 1 (becomes leader)
    const res1 = await arbiter.registerHeartbeat({
      id: "api-node-1",
      nodeType: "API",
      host: "10.0.1.10",
      port: 8080,
    });
    expect(res1.isLeader).toBe(true);
    expect(res1.epoch).toBe(1);

    // Register node 2 (follower)
    const res2 = await arbiter.registerHeartbeat({
      id: "api-node-2",
      nodeType: "API",
      host: "10.0.1.11",
      port: 8080,
    });
    expect(res2.isLeader).toBe(false);

    // Simulate leader node 1 timeout (> 15000ms)
    const check = await arbiter.checkNodeLiveness(0); // immediate timeout for test
    expect(check.leaderPromoted).toBe(true);
    expect(arbiter.getCurrentEpoch()).toBeGreaterThan(1);
    expect(arbiter.getLeaderId()).toBe("api-node-2");
  });

  it("creates control plane DR backup package with cryptographic checksum and signature", async () => {
    const dr = new DisasterRecoveryService();
    const backup = await dr.createBackupSnapshot("s3://bank-dr-cold-storage/backups/dr-20260912.tar.gz");

    expect(backup.id).toBeDefined();
    expect(backup.sha256Hash.length).toBe(64);
    expect(backup.totalRecords).toBeGreaterThan(1000);
    expect(backup.rpoSeconds).toBeLessThanOrEqual(300); // RPO <= 5m constraint
    expect(backup.status).toBe("VERIFIED");
  });

  it("executes automated restoration drill verifying RPO < 5m and RTO < 15m", async () => {
    const dr = new DisasterRecoveryService();
    const backup = await dr.createBackupSnapshot("s3://bank-dr-cold-storage/backups/dr-20260912.tar.gz");

    const drillResult = await dr.runRestoreDrill(backup);

    expect(drillResult.passed).toBe(true);
    expect(drillResult.rpoCompliant).toBe(true);
    expect(drillResult.rtoCompliant).toBe(true);
    expect(drillResult.rtoSeconds).toBeLessThanOrEqual(900); // 15m constraint
    expect(drillResult.discrepancies.length).toBe(0);
    expect(drillResult.recordsVerified).toBe(backup.totalRecords);
  });
});
