import type {
  BranchConnectionState,
  EdgeCommand,
  EdgeCommandResult,
  EdgeConfiguration,
  EdgeHeartbeat,
  EdgeStateChangeEvent,
} from "../domain/edge-protocol.types.js";

export interface RegisteredEdgeGateway {
  edgeId: string;
  branchId: string;
  branchName: string;
  hostname: string;
  edgeVersion: string;
  lastSeenAt: Date;
  lastHeartbeat?: EdgeHeartbeat | undefined;
  desiredConfigVersion: number;
  runningConfigVersion: number;
  configOutOfSync: boolean;
  connectionState: BranchConnectionState;
  lastReceivedSequenceNumber: number;
}

export class EdgeGatewayManagerService {
  private readonly gateways = new Map<string, RegisteredEdgeGateway>();
  private readonly events = new Map<string, EdgeStateChangeEvent>(); // key: `${edgeId}:${sequenceNumber}`
  private readonly commands = new Map<string, EdgeCommand>();
  private readonly commandResults = new Map<string, EdgeCommandResult>();
  private readonly configurations = new Map<string, EdgeConfiguration>();

  constructor() {
    this.seedDefaultGateways();
  }

  async registerEdgeGateway(params: {
    edgeId: string;
    branchId: string;
    branchName: string;
    hostname: string;
    edgeVersion: string;
    runningConfigVersion?: number | undefined;
  }): Promise<{ gateway: RegisteredEdgeGateway; configuration: EdgeConfiguration }> {
    const config = this.getOrCreateConfiguration(params.branchId);

    const gateway: RegisteredEdgeGateway = {
      edgeId: params.edgeId,
      branchId: params.branchId,
      branchName: params.branchName,
      hostname: params.hostname,
      edgeVersion: params.edgeVersion,
      lastSeenAt: new Date(),
      desiredConfigVersion: config.version,
      runningConfigVersion: params.runningConfigVersion ?? config.version,
      configOutOfSync: (params.runningConfigVersion ?? config.version) !== config.version,
      connectionState: "ONLINE",
      lastReceivedSequenceNumber: 0,
    };

    this.gateways.set(params.edgeId, gateway);
    return { gateway, configuration: config };
  }

  async processHeartbeat(heartbeat: EdgeHeartbeat): Promise<{ acknowledged: boolean; configUpdateRequired: boolean; connectionState: BranchConnectionState }> {
    const gw = this.gateways.get(heartbeat.edgeId);
    const now = new Date();

    if (gw) {
      gw.lastSeenAt = now;
      gw.lastHeartbeat = heartbeat;
      gw.runningConfigVersion = heartbeat.systemMetrics.configVersion;
      gw.configOutOfSync = gw.runningConfigVersion !== gw.desiredConfigVersion;
      gw.connectionState = this.calculateConnectionState(now, heartbeat.status);
    } else {
      const config = this.getOrCreateConfiguration(heartbeat.branchId);
      this.gateways.set(heartbeat.edgeId, {
        edgeId: heartbeat.edgeId,
        branchId: heartbeat.branchId,
        branchName: `Branch ${heartbeat.branchId}`,
        hostname: `${heartbeat.edgeId}.internal`,
        edgeVersion: heartbeat.edgeVersion,
        lastSeenAt: now,
        lastHeartbeat: heartbeat,
        desiredConfigVersion: config.version,
        runningConfigVersion: heartbeat.systemMetrics.configVersion,
        configOutOfSync: heartbeat.systemMetrics.configVersion !== config.version,
        connectionState: this.calculateConnectionState(now, heartbeat.status),
        lastReceivedSequenceNumber: 0,
      });
    }

    const currentGw = this.gateways.get(heartbeat.edgeId)!;
    return {
      acknowledged: true,
      configUpdateRequired: currentGw.configOutOfSync,
      connectionState: currentGw.connectionState,
    };
  }

  async ingestEventBatch(events: EdgeStateChangeEvent[]): Promise<{ ingestedCount: number; duplicateCount: number; lastSequenceNumber: number }> {
    let ingestedCount = 0;
    let duplicateCount = 0;
    let maxSeq = 0;

    for (const evt of events) {
      const key = `${evt.edgeId}:${evt.sequenceNumber}`;
      if (this.events.has(key)) {
        duplicateCount++;
        continue;
      }

      this.events.set(key, evt);
      ingestedCount++;
      if (evt.sequenceNumber > maxSeq) maxSeq = evt.sequenceNumber;

      // Update gateway sequence
      const gw = this.gateways.get(evt.edgeId);
      if (gw && evt.sequenceNumber > gw.lastReceivedSequenceNumber) {
        gw.lastReceivedSequenceNumber = evt.sequenceNumber;
        gw.lastSeenAt = new Date();
      }
    }

    return { ingestedCount, duplicateCount, lastSequenceNumber: maxSeq };
  }

  async dispatchCommand(command: EdgeCommand): Promise<EdgeCommand> {
    this.commands.set(command.commandId, command);
    this.commandResults.set(command.commandId, {
      commandId: command.commandId,
      status: "ACCEPTED",
    });
    return command;
  }

  async recordCommandResult(result: EdgeCommandResult): Promise<EdgeCommandResult> {
    this.commandResults.set(result.commandId, result);
    return result;
  }

  async getCommandStatus(commandId: string): Promise<EdgeCommandResult | null> {
    return this.commandResults.get(commandId) ?? null;
  }

  async getEdgeGateway(edgeId: string): Promise<RegisteredEdgeGateway | null> {
    const gw = this.gateways.get(edgeId);
    if (!gw) return null;

    gw.connectionState = this.calculateConnectionState(gw.lastSeenAt, gw.lastHeartbeat?.status ?? "HEALTHY");
    return gw;
  }

  async listEdgeGateways(): Promise<RegisteredEdgeGateway[]> {
    const list = Array.from(this.gateways.values());
    for (const gw of list) {
      gw.connectionState = this.calculateConnectionState(gw.lastSeenAt, gw.lastHeartbeat?.status ?? "HEALTHY");
    }
    return list;
  }

  getOrCreateConfiguration(branchId: string): EdgeConfiguration {
    const existing = this.configurations.get(branchId);
    if (existing) return existing;

    const defaultConfig: EdgeConfiguration = {
      branchId,
      version: 54,
      issuedAt: new Date("2026-08-01T00:00:00Z"),
      monitoringPolicy: {
        cameraPollIntervalSec: 30,
        recorderPollIntervalSec: 30,
        heartbeatIntervalSec: 30,
      },
      recordingPolicy: {
        continuousRecording: true,
        resolution: "1080p",
      },
      retentionPolicy: {
        mandatoryDays: 90,
      },
      analyticsPolicy: {
        localInferenceEnabled: true,
        intrusionZones: ["vault_entry", "cash_counter", "atm_lobby"],
      },
    };

    this.configurations.set(branchId, defaultConfig);
    return defaultConfig;
  }

  calculateConnectionState(lastSeen: Date, reportedHealth: string): BranchConnectionState {
    const ageMs = Date.now() - lastSeen.getTime();
    if (ageMs > 180_000) return "OFFLINE";
    if (ageMs > 60_000) return "STALE";
    if (reportedHealth === "CRITICAL" || reportedHealth === "DEGRADED") return "DEGRADED";
    return "ONLINE";
  }

  private seedDefaultGateways() {
    const now = new Date();

    // 1. Thrissur 14 Gateway (Healthy)
    this.registerEdgeGateway({
      edgeId: "edge-thrissur-14",
      branchId: "branch-thrissur-14",
      branchName: "Thrissur Main 14",
      hostname: "edge-gw.thrissur14.bank.internal",
      edgeVersion: "3.8.2",
      runningConfigVersion: 54,
    });

    this.processHeartbeat({
      edgeId: "edge-thrissur-14",
      branchId: "branch-thrissur-14",
      timestamp: now,
      edgeVersion: "3.8.2",
      status: "HEALTHY",
      recorderCount: 2,
      cameraCount: 40,
      cameraHealthy: 40,
      cameraFailed: 0,
      activeAlerts: 0,
      systemMetrics: {
        cpuPercent: 18,
        ramPercent: 42,
        diskPercent: 63,
        queueBacklog: 0,
        hoLatencyMs: 24,
        configVersion: 54,
        uptimeSeconds: 864000,
      },
    });

    // 2. Kochi 08 Gateway (Degraded - 1 camera failure, running v53 vs desired v54)
    this.registerEdgeGateway({
      edgeId: "edge-kochi-08",
      branchId: "branch-kochi-08",
      branchName: "Kochi Main 08",
      hostname: "edge-gw.kochi08.bank.internal",
      edgeVersion: "3.8.1",
      runningConfigVersion: 53,
    });

    this.processHeartbeat({
      edgeId: "edge-kochi-08",
      branchId: "branch-kochi-08",
      timestamp: now,
      edgeVersion: "3.8.1",
      status: "DEGRADED",
      recorderCount: 2,
      cameraCount: 40,
      cameraHealthy: 39,
      cameraFailed: 1,
      activeAlerts: 1,
      systemMetrics: {
        cpuPercent: 35,
        ramPercent: 58,
        diskPercent: 71,
        queueBacklog: 2,
        hoLatencyMs: 38,
        configVersion: 53, // Out of sync
        uptimeSeconds: 432000,
      },
    });
  }
}

export const edgeGatewayManager = new EdgeGatewayManagerService();
