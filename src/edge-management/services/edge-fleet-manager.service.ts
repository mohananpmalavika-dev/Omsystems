import type {
  EdgeAgent,
  EdgeAgentStatus,
  EdgeAgentHealthSnapshot,
  EdgeAgentHeartbeatPayload,
  EdgeAgentRelease,
  EdgeDeployment,
  EdgeUpgradeRun,
  UpgradeStatus,
  UpgradeEligibility,
  FleetSummary,
  EdgeGatewayTwinNode,
  CertificateHealth,
  ReconciliationState,
} from "../domain/edge-lifecycle.types.js";

export class EdgeFleetManagerService {
  private agents = new Map<string, EdgeAgent>();
  private releases = new Map<string, EdgeAgentRelease>();
  private deployments = new Map<string, EdgeDeployment>();
  private upgradeRuns = new Map<string, EdgeUpgradeRun>();

  getFleetSummary(): FleetSummary {
    const list = [...this.agents.values()];
    const versionDist: Record<string, number> = {};
    let online = 0,
      degraded = 0,
      offline = 0;
    let compliantConfig = 0,
      driftedConfig = 0;
    let certHealthy = 0,
      cert14 = 0,
      cert30 = 0,
      certExpired = 0;

    for (const a of list) {
      if (a.status === "ONLINE") online++;
      else if (a.status === "DEGRADED") degraded++;
      else offline++;

      versionDist[a.agentVersion] = (versionDist[a.agentVersion] || 0) + 1;

      if (a.configReconciliation === "COMPLIANT") compliantConfig++;
      else driftedConfig++;

      if (a.certificateHealth === "HEALTHY") certHealthy++;
      else if (a.certificateHealth === "WARNING") cert30++;
      else if (a.certificateHealth === "CRITICAL") cert14++;
      else certExpired++;
    }

    return {
      totalAgents: list.length,
      onlineCount: online,
      degradedCount: degraded,
      offlineCount: offline,
      latestVersion: "3.7.2",
      versionDistribution: versionDist,
      configCompliantCount: compliantConfig,
      configDriftedCount: driftedConfig,
      certificates: {
        healthyCount: certHealthy,
        expiringWithin30Days: cert30,
        expiringWithin14Days: cert14,
        expiredCount: certExpired,
      },
      activeRollouts: this.deployments.size,
      upgradeFailures24h: 2,
    };
  }

  listAgents(filter?: { status?: string; version?: string; search?: string; driftOnly?: boolean }) {
    let result = [...this.agents.values()];

    if (filter?.status) {
      result = result.filter((a) => a.status === filter.status);
    }
    if (filter?.version) {
      result = result.filter((a) => a.agentVersion === filter.version);
    }
    if (filter?.driftOnly) {
      result = result.filter(
        (a) => a.versionReconciliation === "DRIFTED" || a.configReconciliation === "DRIFTED",
      );
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.branchName.toLowerCase().includes(q) ||
          a.branchId.toLowerCase().includes(q) ||
          a.branchCode.toLowerCase().includes(q) ||
          a.hostname.toLowerCase().includes(q),
      );
    }

    return result;
  }

  getAgentById(agentId: string): EdgeAgent | undefined {
    return this.agents.get(agentId);
  }

  getGatewayDigitalTwin(agentId: string): EdgeGatewayTwinNode | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;

    const totalCams = agent.telemetry?.cameras.configured || 24;
    const onlineCams = agent.telemetry?.cameras.reachable || 24;

    return {
      twinId: `twin-${agent.id}`,
      tenantId: agent.tenantId,
      branchId: agent.branchId,
      branchName: agent.branchName,
      hostname: agent.hostname,
      overallHealth:
        agent.status === "ONLINE"
          ? "HEALTHY"
          : agent.status === "DEGRADED" || agent.status === "DRIFTED"
          ? "WARNING"
          : "CRITICAL",
      dimensions: {
        connectivity: agent.status === "ONLINE" ? "HEALTHY" : agent.status === "DEGRADED" ? "DEGRADED" : "OFFLINE",
        hardware: (agent.telemetry?.cpuPercent || 0) > 80 ? "HIGH_LOAD" : "HEALTHY",
        agent: agent.versionReconciliation === "COMPLIANT" ? "HEALTHY" : "DRIFTED",
        configuration: agent.configReconciliation === "COMPLIANT" ? "COMPLIANT" : "DRIFTED",
        security: agent.certificateHealth === "CRITICAL" ? "CERT_CRITICAL" : agent.certificateHealth === "WARNING" ? "CERT_WARNING" : "HEALTHY",
        recording: onlineCams === totalCams ? "HEALTHY" : onlineCams > 0 ? "PARTIAL_DROP" : "FAILED",
      },
      hardware: {
        cpuModel: "Intel Core i5-12500T (6 Cores / 12 Threads)",
        cpuCores: 6,
        memoryGb: 8,
        diskTotalGb: 512,
      },
      agent: {
        version: agent.agentVersion,
        desiredVersion: agent.desiredAgentVersion,
        status: agent.status,
      },
      configuration: {
        actualVersion: agent.configurationVersion,
        desiredVersion: agent.desiredConfigurationVersion,
      },
      security: {
        certificateExpiresAt: agent.certificateExpiresAt,
        remainingDays: agent.daysToCertExpiry,
      },
      blastRadius: {
        camerasImpacted: totalCams,
        recordingChannelsAtRisk: totalCams - 1,
        activeAlertsAffected: agent.status === "OFFLINE" ? 2 : 0,
        nvrsAttached: 1,
        openInvestigationsReferencing: 1,
      },
      dependencies: {
        router: `router-${agent.branchId.toLowerCase()}`,
        cameras: Array.from({ length: totalCams }, (_, idx) => `CAM-${idx + 1}`),
        recorders: [`NVR-${agent.branchId}`],
      },
    };
  }

  processHeartbeat(payload: EdgeAgentHeartbeatPayload) {
    let agent = this.agents.get(payload.agentId);
    const now = new Date();

    if (!agent) {
      agent = {
        id: payload.agentId,
        tenantId: "omsystems",
        branchId: payload.branchId,
        branchName: `Branch ${payload.branchId}`,
        branchCode: payload.branchId,
        gatewayId: `gw-${payload.branchId.toLowerCase()}`,
        hostname: `gw-${payload.branchId.toLowerCase()}.local`,
        platform: "windows",
        architecture: "x64",
        agentVersion: payload.agentVersion,
        desiredAgentVersion: "3.7.2",
        configurationVersion: payload.configurationVersion,
        desiredConfigurationVersion: "v34",
        status: "ONLINE",
        versionReconciliation: payload.agentVersion === "3.7.2" ? "COMPLIANT" : "DRIFTED",
        configReconciliation: payload.configurationVersion === "v34" ? "COMPLIANT" : "DRIFTED",
        lastHeartbeatAt: now.toISOString(),
        firstSeenAt: now.toISOString(),
        installedAt: now.toISOString(),
        startedAt: payload.startedAt,
        certificateHealth: "HEALTHY",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      this.agents.set(agent.id, agent);
    }

    agent.lastHeartbeatAt = now.toISOString();
    agent.agentVersion = payload.agentVersion;
    agent.configurationVersion = payload.configurationVersion;
    agent.status = "ONLINE";
    agent.versionReconciliation = payload.agentVersion === agent.desiredAgentVersion ? "COMPLIANT" : "DRIFTED";
    agent.configReconciliation = payload.configurationVersion === agent.desiredConfigurationVersion ? "COMPLIANT" : "DRIFTED";
    if (payload.lastRestartReason) agent.lastRestartReason = payload.lastRestartReason;

    agent.telemetry = {
      agentId: payload.agentId,
      observedAt: now.toISOString(),
      cpuPercent: payload.system.cpuPercent,
      memoryUsedBytes: payload.system.memoryUsedBytes,
      memoryTotalBytes: payload.system.memoryTotalBytes,
      diskUsedBytes: payload.system.diskUsedBytes,
      diskTotalBytes: payload.system.diskTotalBytes,
      serviceUptimeSeconds: payload.serviceUptimeSeconds,
      services: payload.services,
      cameras: payload.cameras,
      clockOffsetMs: 8,
    };

    return { success: true, desiredState: { agentVersion: agent.desiredAgentVersion, configurationVersion: agent.desiredConfigurationVersion } };
  }

  checkEligibility(agentId: string): UpgradeEligibility {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { eligible: false, blockers: [{ code: "AGENT_OFFLINE", message: "Agent record not found" }] };
    }

    const blockers: UpgradeEligibility["blockers"] = [];

    if (agent.status === "OFFLINE") {
      blockers.push({ code: "AGENT_OFFLINE", message: "Agent is currently OFFLINE; cannot execute remote upgrade." });
    }

    const freeDiskBytes = (agent.telemetry?.diskTotalBytes || 0) - (agent.telemetry?.diskUsedBytes || 0);
    const freeDiskGb = freeDiskBytes / (1024 * 1024 * 1024);
    if (freeDiskGb < 2.0) {
      blockers.push({ code: "LOW_DISK", message: `Only ${freeDiskGb.toFixed(1)} GB available (Minimum required: 2.0 GB)` });
    }

    if ((agent.telemetry?.cpuPercent || 0) > 85) {
      blockers.push({ code: "HIGH_CPU", message: `CPU load currently at ${agent.telemetry?.cpuPercent}% (> 85% threshold)` });
    }

    return {
      eligible: blockers.length === 0,
      blockers,
    };
  }

  async executeUpgrade(agentId: string, targetVersion = "3.7.2"): Promise<EdgeUpgradeRun> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error("agent_not_found");

    const runId = `UPG-${Date.now()}-${agent.branchId}`;
    const now = new Date().toISOString();

    const run: EdgeUpgradeRun = {
      runId,
      agentId,
      branchId: agent.branchId,
      fromVersion: agent.agentVersion,
      toVersion: targetVersion,
      status: "REQUESTED",
      stageLogs: [{ stage: "REQUESTED", enteredAt: now, message: `Remote upgrade initiated from v${agent.agentVersion} to v${targetVersion}` }],
      preUpgradeBaseline: {
        cameraReachable: agent.telemetry?.cameras.reachable || 24,
        recordingHealthy: agent.telemetry?.cameras.recording || 24,
        freeDiskGb: 272,
      },
      startedAt: now,
    };

    this.upgradeRuns.set(runId, run);
    agent.currentUpgrade = run;
    agent.status = "UPGRADING";

    // Simulate complete durable state machine transitions
    const stages: Array<{ stage: UpgradeStatus; msg: string; delay: number }> = [
      { stage: "ELIGIBILITY_CHECK", msg: "Pre-flight checks passed: 272 GB disk free, CPU 21%, No active P1 incident.", delay: 300 },
      { stage: "DOWNLOADING", msg: "Downloading signed package edge-agent-3.7.2-signed.zip over outbound TLS...", delay: 400 },
      { stage: "VERIFYING_PACKAGE", msg: "Package SHA-256 (c83c96...) and RSA signature cryptographically verified.", delay: 300 },
      { stage: "STAGED", msg: "Package unpacked to C:\\ProgramData\\SentinelGrid\\versions\\3.7.2\\", delay: 200 },
      { stage: "INSTALLING", msg: "Edge Supervisor switching active binary symlink to v3.7.2.", delay: 300 },
      { stage: "RESTARTING", msg: "Edge Supervisor restarting Sentinel Edge Service daemon...", delay: 400 },
      { stage: "VERIFYING_HEALTH", msg: "Post-upgrade verification: Checking MediaMTX, ONVIF discovery, and 24 RTSP channels...", delay: 500 },
      { stage: "SUCCESS", msg: "Upgrade verified healthy! 24/24 cameras streaming, 0 dropped frames. Version active: 3.7.2", delay: 200 },
    ];

    for (const s of stages) {
      run.status = s.stage;
      run.stageLogs.push({
        stage: s.stage,
        enteredAt: new Date().toISOString(),
        message: s.msg,
      });
    }

    run.completedAt = new Date().toISOString();
    run.postUpgradeVerification = {
      cameraReachable: agent.telemetry?.cameras.reachable || 24,
      recordingHealthy: agent.telemetry?.cameras.recording || 24,
      mediaMtxOk: true,
      streamCheckOk: true,
    };

    agent.agentVersion = targetVersion;
    agent.status = "ONLINE";
    agent.versionReconciliation = "COMPLIANT";
    agent.lastRestartReason = "UPGRADE";
    agent.lastRestartAt = new Date().toISOString();

    return run;
  }

  async executeRollback(agentId: string): Promise<EdgeUpgradeRun> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error("agent_not_found");

    const previousVersion = "3.6.9";
    const runId = `ROL-${Date.now()}-${agent.branchId}`;
    const now = new Date().toISOString();

    const run: EdgeUpgradeRun = {
      runId,
      agentId,
      branchId: agent.branchId,
      fromVersion: agent.agentVersion,
      toVersion: previousVersion,
      status: "ROLLING_BACK",
      stageLogs: [
        { stage: "ROLLING_BACK", enteredAt: now, message: `Automatic / Operator rollback initiated from v${agent.agentVersion} to v${previousVersion}` },
        { stage: "STAGED", enteredAt: now, message: `Edge Supervisor switching symlink back to C:\\ProgramData\\SentinelGrid\\versions\\3.6.9\\` },
        { stage: "RESTARTING", enteredAt: now, message: `Daemon restarted in rollback version 3.6.9.` },
        { stage: "ROLLED_BACK", enteredAt: now, message: `Rollback complete. System verified healthy under v3.6.9.` },
      ],
      startedAt: now,
      completedAt: new Date().toISOString(),
    };

    this.upgradeRuns.set(runId, run);
    agent.currentUpgrade = run;
    agent.agentVersion = previousVersion;
    agent.status = "ONLINE";
    agent.versionReconciliation = "DRIFTED";
    agent.lastRestartReason = "ROLLBACK";
    agent.lastRestartAt = new Date().toISOString();

    return run;
  }

  reconcileConfiguration(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error("agent_not_found");

    agent.configurationVersion = agent.desiredConfigurationVersion;
    agent.configReconciliation = "COMPLIANT";
    if (agent.status === "DRIFTED" && agent.versionReconciliation === "COMPLIANT") {
      agent.status = "ONLINE";
    }

    return {
      success: true,
      message: `Configuration for ${agent.branchName} reconciled to ${agent.desiredConfigurationVersion}.`,
      agent,
    };
  }

  createStagedRollout(releaseId = "REL-3.7.2"): EdgeDeployment {
    const release = this.releases.get(releaseId);
    if (!release) throw new Error("release_not_found");

    const deploymentId = `DEP-${Date.now()}`;
    const allAgents = [...this.agents.values()];
    const canaryCandidates = allAgents.slice(0, 20).map((a) => a.id);

    const deployment: EdgeDeployment = {
      id: deploymentId,
      releaseId,
      targetVersion: release.version,
      currentStage: "STAGE_1_CANARY_5",
      status: "ACTIVE",
      totalTargetAgents: allAgents.length,
      upgradedCount: 20,
      failedCount: 0,
      rolledBackCount: 0,
      healthMetrics: {
        upgradeSuccessRatePct: 100.0,
        offlineAgentDeltaPct: 0.0,
        cameraLossDeltaPct: 0.0,
        recordingFailureCount: 0,
        rollbackRatePct: 0.0,
      },
      healthGatePassed: true,
      canaryAgentIds: canaryCandidates,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Auto-upgrade the canary candidates
    for (const cid of canaryCandidates) {
      const a = this.agents.get(cid);
      if (a) {
        a.agentVersion = release.version;
        a.versionReconciliation = "COMPLIANT";
        if (a.status === "DRIFTED" && a.configReconciliation === "COMPLIANT") {
          a.status = "ONLINE";
        }
      }
    }

    this.deployments.set(deploymentId, deployment);
    return deployment;
  }
}
