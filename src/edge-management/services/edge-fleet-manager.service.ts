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

  constructor() {
    this.seedInitialFleet();
  }

  private seedInitialFleet() {
    // 1. Seed Authorized Signed Releases
    const rel372: EdgeAgentRelease = {
      id: "REL-3.7.2",
      version: "3.7.2",
      platform: "windows",
      architecture: "x64",
      packageUrl: "https://artifacts.kryptonvision.internal/releases/edge-agent-3.7.2-signed.zip",
      sha256: "c83c96048a9b22e7d8f99e4501a4e21a37c1d32098e6bfa58a4362d04a625e11",
      signature: "MEYCIQD1oN3Q7Lp2kF8a99kPz0ZzZ888+==RSA_SHA256_OFFICIAL_SIGNATURE",
      minUpgradeFrom: "3.3.0",
      releaseNotes: "Performance optimizations, MediaMTX 1.11.0 upgrade, dual-WAN fast failover, SHA-256 evidence sealing.",
      status: "RELEASED",
      createdBy: "secops-lead@kryptonvision.io",
      approvedBy: "cso-approver@kryptonvision.io",
      createdAt: "2026-08-15T10:30:00Z",
    };
    this.releases.set(rel372.id, rel372);

    const rel371: EdgeAgentRelease = {
      id: "REL-3.7.1",
      version: "3.7.1",
      platform: "windows",
      architecture: "x64",
      packageUrl: "https://artifacts.kryptonvision.internal/releases/edge-agent-3.7.1-signed.zip",
      sha256: "e72d8291048a9b22e7d8f99e4501a4e21a37c1d32098e6bfa58a4362d04a77ff",
      signature: "MEQCID9xY72bL18a99kPz0ZzZ888+==RSA_SHA256_OFFICIAL_SIGNATURE",
      minUpgradeFrom: "3.0.0",
      releaseNotes: "Bug fixes for ONVIF camera discovery and SATA disk health polling.",
      status: "APPROVED",
      createdBy: "secops-lead@kryptonvision.io",
      approvedBy: "cso-approver@kryptonvision.io",
      createdAt: "2026-07-20T08:00:00Z",
    };
    this.releases.set(rel371.id, rel371);

    // 2. Seed 400 Branches Edge Fleet with realistic realistic distributions
    const branches = [
      { id: "BR-001", name: "Kochi Main Hub", code: "KCH-01", v: "3.7.2", cfg: "v34", desCfg: "v34", status: "ONLINE" as EdgeAgentStatus, certDays: 140, cams: 24, cpu: 18.2, mem: 42 },
      { id: "BR-002", name: "Trivandrum City Branch", code: "TVM-02", v: "3.7.1", cfg: "v34", desCfg: "v34", status: "ONLINE" as EdgeAgentStatus, certDays: 28, cams: 16, cpu: 22.4, mem: 38 },
      { id: "BR-003", name: "Calicut Hub", code: "CLT-03", v: "3.7.2", cfg: "v32", desCfg: "v34", status: "DRIFTED" as EdgeAgentStatus, certDays: 85, cams: 20, cpu: 29.1, mem: 55 },
      { id: "BR-004", name: "Bangalore MG Road", code: "BLR-01", v: "3.7.2", cfg: "v34", desCfg: "v34", status: "ONLINE" as EdgeAgentStatus, certDays: 93, cams: 32, cpu: 21.0, mem: 46 },
      { id: "BR-118", name: "Ernakulam South", code: "EKM-118", v: "3.6.9", cfg: "v31", desCfg: "v34", status: "DRIFTED" as EdgeAgentStatus, certDays: 19, cams: 24, cpu: 34.5, mem: 62 },
      { id: "BR-226", name: "Mumbai Fort Branch", code: "BOM-226", v: "3.6.9", cfg: "v30", desCfg: "v34", status: "OFFLINE" as EdgeAgentStatus, certDays: 5, cams: 16, cpu: 0, mem: 0 },
      { id: "BR-305", name: "Chennai T-Nagar", code: "CHN-305", v: "3.7.2", cfg: "v34", desCfg: "v34", status: "ONLINE" as EdgeAgentStatus, certDays: 12, cams: 24, cpu: 19.8, mem: 40 },
    ];

    // Expand to 400 branches total
    for (let i = 1; i <= 400; i++) {
      const branchId = `BR-${String(i).padStart(3, "0")}`;
      const existing = branches.find((b) => b.id === branchId);

      let version = "3.7.2";
      let config = "v34";
      let status: EdgeAgentStatus = "ONLINE";
      let certDays = 90 + (i % 80);
      let cameras = 16 + (i % 16);
      let cpu = 15 + (i % 25);
      let mem = 35 + (i % 30);
      let name = `Branch ${branchId}`;
      let code = `BRN-${i}`;

      if (existing) {
        version = existing.v;
        config = existing.cfg;
        status = existing.status;
        certDays = existing.certDays;
        cameras = existing.cams;
        cpu = existing.cpu;
        mem = existing.mem;
        name = existing.name;
        code = existing.code;
      } else {
        if (i % 25 === 0) {
          status = "DEGRADED";
          version = "3.7.1";
        } else if (i % 80 === 0) {
          status = "OFFLINE";
          cpu = 0;
          mem = 0;
        } else if (i % 14 === 0) {
          status = "DRIFTED";
          config = "v32";
        } else if (i % 30 === 0) {
          certDays = 12; // Expiring within 14 days
        }
      }

      const certHealth: CertificateHealth =
        certDays <= 0 ? "EXPIRED" : certDays <= 14 ? "CRITICAL" : certDays <= 30 ? "WARNING" : "HEALTHY";

      const versionRecon: ReconciliationState = version === "3.7.2" ? "COMPLIANT" : "DRIFTED";
      const configRecon: ReconciliationState = config === "v34" ? "COMPLIANT" : "DRIFTED";

      const now = new Date();
      const heartbeatAgeSec = status === "OFFLINE" ? 180 : status === "DEGRADED" ? 65 : 12;
      const lastHb = new Date(now.getTime() - heartbeatAgeSec * 1000).toISOString();

      const agent: EdgeAgent = {
        id: `edge-${branchId.toLowerCase()}-01`,
        tenantId: "omsystems",
        branchId,
        branchName: name,
        branchCode: code,
        gatewayId: `gw-${branchId.toLowerCase()}`,
        hostname: `gw-edge-${branchId.toLowerCase()}.local`,
        platform: "windows",
        architecture: "x64",
        agentVersion: version,
        desiredAgentVersion: "3.7.2",
        configurationVersion: config,
        desiredConfigurationVersion: "v34",
        mediaMtxVersion: "1.11.0",
        status,
        versionReconciliation: versionRecon,
        configReconciliation: configRecon,
        lastHeartbeatAt: lastHb,
        firstSeenAt: "2026-01-10T00:00:00Z",
        installedAt: "2026-01-10T00:00:00Z",
        startedAt: new Date(now.getTime() - 8 * 86400000).toISOString(),
        lastRestartAt: new Date(now.getTime() - 8 * 86400000).toISOString(),
        lastRestartReason: "OS_BOOT",
        certificateSerial: `18A982${i}FE88`,
        certificateExpiresAt: new Date(now.getTime() + certDays * 86400000).toISOString(),
        certificateHealth: certHealth,
        daysToCertExpiry: certDays,
        telemetry: {
          agentId: `edge-${branchId.toLowerCase()}-01`,
          observedAt: lastHb,
          cpuPercent: cpu,
          memoryUsedBytes: mem * 1024 * 1024 * 80,
          memoryTotalBytes: 8 * 1024 * 1024 * 1024,
          diskUsedBytes: 240 * 1024 * 1024 * 1024,
          diskTotalBytes: 512 * 1024 * 1024 * 1024,
          serviceUptimeSeconds: status === "OFFLINE" ? 0 : 8 * 86400,
          services: {
            edgeAgent: status === "OFFLINE" ? "FAILED" : "HEALTHY",
            mediaMtx: status === "OFFLINE" ? "FAILED" : "HEALTHY",
            ffmpegWorkers: status === "OFFLINE" ? "FAILED" : "HEALTHY",
          },
          cameras: {
            configured: cameras,
            reachable: status === "OFFLINE" ? 0 : status === "DEGRADED" ? cameras - 2 : cameras,
            streaming: status === "OFFLINE" ? 0 : status === "DEGRADED" ? cameras - 2 : cameras,
            recording: status === "OFFLINE" ? 0 : status === "DEGRADED" ? cameras - 2 : cameras,
          },
          clockOffsetMs: 12,
        },
        createdAt: "2026-01-10T00:00:00Z",
        updatedAt: now.toISOString(),
      };

      this.agents.set(agent.id, agent);
    }
  }

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
