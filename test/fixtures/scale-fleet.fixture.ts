/**
 * Scale Fleet Test Fixture
 * 
 * Provides test data for 400-branch scale tests, load drills, and report tests.
 * Resides exclusively in test/fixtures/, ensuring zero simulation in production code.
 */

export async function seedScaleFleet(
  store: any,
  branchCount = 400,
  tenantId = "bank-corp"
): Promise<{ branchCount: number; cameraCount: number; recorderCount: number }> {
  const now = new Date();
  let cameraCount = 0;
  let recorderCount = 0;

  for (let i = 1; i <= branchCount; i++) {
    const branchId = `branch-test-${i.toString().padStart(3, "0")}`;
    const branchCode = `KL-${(100 + i).toString().padStart(3, "0")}`;
    const branchName = i === 1 ? "Aluva Main Branch" : i === 2 ? "Kochi Main Branch" : `Bank Branch ${i}`;
    const region = i % 2 === 0 ? "Kerala Central" : "Kerala South";

    if (store.nodes) {
      store.nodes.set(branchId, {
        id: branchId,
        tenantId,
        name: branchName,
        code: branchCode,
        type: "branch",
        parentId: null,
        metadata: { region },
        status: "active",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }

    const isCrit = i % 40 === 0;
    const isWarn = i % 15 === 0 && !isCrit;
    const isOffline = i === 4;
    const isUnknown = i === 5;

    // 1. Recorder
    recorderCount++;
    const recId = `rec-${branchId}-01`;
    if (store.operationalTelemetry && !isUnknown) {
      store.operationalTelemetry.set(`${tenantId}:${branchId}:recorder:${recId}`, {
        idempotencyKey: `rec-tel-${branchId}`,
        tenantId,
        branchId,
        deviceType: "recorder",
        deviceId: recId,
        observedAt: isOffline ? new Date(now.getTime() - 7200_000).toISOString() : now.toISOString(),
        metrics: {
          reachable: !isOffline,
          status: isOffline ? "offline" : isCrit ? "critical" : isWarn ? "warning" : "healthy",
          channelsTotal: 16,
          channelsActive: isOffline ? 0 : 16,
          channelsRecording: isOffline ? 0 : isCrit ? 12 : 16,
          storageStatus: isCrit ? "critical" : isWarn ? "warning" : "healthy",
        },
      });

      // 2. Disks
      const diskId = `disk-${branchId}-01`;
      store.operationalTelemetry.set(`${tenantId}:${branchId}:disk:${diskId}`, {
        idempotencyKey: `disk-tel-${branchId}`,
        tenantId,
        branchId,
        deviceType: "disk",
        deviceId: diskId,
        observedAt: now.toISOString(),
        metrics: {
          status: isCrit ? "failed" : isWarn ? "warning" : "healthy",
          smartStatus: isCrit ? "failed" : isWarn ? "warning" : "healthy",
          capacityGB: 4000,
          usedGB: isCrit ? 3950 : 2500,
          temperature: isCrit ? 58 : 38,
        },
      });

      // 3. Network
      store.operationalTelemetry.set(`${tenantId}:${branchId}:network:gw-${branchId}`, {
        idempotencyKey: `net-tel-${branchId}`,
        tenantId,
        branchId,
        deviceType: "network",
        deviceId: `gw-${branchId}`,
        observedAt: isOffline ? new Date(now.getTime() - 7200_000).toISOString() : now.toISOString(),
        metrics: {
          status: isOffline ? "offline" : isWarn ? "warning" : "online",
          wanState: isOffline ? "OFFLINE" : isWarn ? "FAILOVER" : "ONLINE",
          latencyMs: isWarn ? 120 : 22,
          packetLossPct: isWarn ? 5 : 0,
          packetLossPercent: isWarn ? 5 : 0,
        },
      });
    }

    // 4. Cameras
    const camCountPerBranch = 16;
    for (let c = 1; c <= camCountPerBranch; c++) {
      cameraCount++;
      const camId = `cam-${branchId}-${c.toString().padStart(2, "0")}`;
      const camOffline = isOffline || (isCrit && c > 12);
      const notRecording = isCrit && c >= 14;

      if (store.cameras) {
        store.cameras.set(camId, {
          id: camId,
          nodeId: branchId,
          branchId,
          name: `CAM-${c.toString().padStart(2, "0")}`,
          channel: c,
          streamUrl: `rtsp://camera-${camId}/live`,
          status: isUnknown ? "unknown" : camOffline ? "offline" : "online",
          capabilities: { ptz: false, audio: false },
        });
      }

      if (store.operationalTelemetry && !isUnknown) {
        store.operationalTelemetry.set(`${tenantId}:${branchId}:camera:${camId}`, {
          idempotencyKey: `cam-tel-${camId}`,
          tenantId,
          branchId,
          deviceType: "camera",
          deviceId: camId,
          observedAt: now.toISOString(),
          metrics: {
            status: camOffline ? "critical" : "online",
            streamActive: !camOffline,
            recordingStatus: notRecording ? "stopped" : "recording",
            retentionDays: isCrit ? 72 : 90,
            fps: 25,
            latencyMs: 35,
          },
        });
      }
    }
  }

  // Seed sample P1 alert for branch 40
  if (store.analyticsAlerts) {
    store.analyticsAlerts.push({
      id: "alert-p1-scale-01",
      tenantId,
      cameraId: "cam-branch-test-040-01",
      branchId: "branch-test-040",
      severity: "P1",
      ruleType: "VAULT_INTRUSION",
      status: "open",
      firstDetectedAt: new Date(now.getTime() - 600_000).toISOString(),
      lastDetectedAt: new Date(now.getTime() - 600_000).toISOString(),
      details: { message: "Vault intrusion after-hours detected" },
    });
  }

  return { branchCount, cameraCount, recorderCount };
}
