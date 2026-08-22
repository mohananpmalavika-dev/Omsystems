/**
 * Control-plane facade for branch edge operations.
 *
 * Agent state and discovery are authoritative only when reported by an
 * enrolled edge agent. This service deliberately contains no seeded fleet,
 * synthetic device inventory, or fabricated health/OTA outcomes.
 */

import { EventEmitter } from "node:events";
import type {
  BranchEdgeAgent,
  FleetSummary,
  DeviceDiscoveryReport,
  NetworkDiagnostics,
  CredentialRotationTask,
  ConfigSyncState,
  OtaUpdateRollout,
} from "../domain/edge-product.types.js";

const unavailable = (operation: string): Error => new Error(`${operation}_requires_enrolled_edge_agent_api`);

export class BranchEdgeOrchestratorService extends EventEmitter {
  private readonly agents = new Map<string, BranchEdgeAgent>();
  private readonly discoveryReports = new Map<string, DeviceDiscoveryReport[]>();

  listAgents(): BranchEdgeAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): BranchEdgeAgent | undefined {
    return this.agents.get(agentId);
  }

  getFleetSummary(): FleetSummary {
    const agents = this.listAgents();
    const firmwareDistribution: Record<string, number> = {};
    let onlineCount = 0;
    let degradedCount = 0;
    let bufferingOfflineCount = 0;
    let totalManagedCameras = 0;
    let totalBufferedEventsAcrossFleet = 0;
    for (const agent of agents) {
      if (agent.status === "ONLINE") onlineCount += 1;
      if (agent.status === "DEGRADED") degradedCount += 1;
      if (agent.status === "OFFLINE_BUFFERING") bufferingOfflineCount += 1;
      totalManagedCameras += agent.health.totalCameraCount;
      totalBufferedEventsAcrossFleet += agent.bufferQueue.totalBufferedEvents;
      firmwareDistribution[agent.firmwareVersion] = (firmwareDistribution[agent.firmwareVersion] ?? 0) + 1;
    }
    return {
      totalAgents: agents.length,
      onlineCount,
      degradedCount,
      bufferingOfflineCount,
      totalManagedCameras,
      totalManagedRecorders: 0,
      activeLteFailoverCount: agents.filter((agent) => agent.uplinkMode === "LTE_FAILOVER").length,
      totalBufferedEventsAcrossFleet,
      firmwareDistribution,
      complianceScore: 0,
    };
  }

  async runDeviceDiscovery(_agentId: string, _subnet?: string): Promise<DeviceDiscoveryReport> {
    throw unavailable("device_discovery");
  }

  async runNetworkDiagnostics(_agentId: string): Promise<NetworkDiagnostics> {
    throw unavailable("network_diagnostics");
  }

  async rotateCameraCredentials(_agentId: string, _deviceId: string, _deviceIp: string): Promise<CredentialRotationTask> {
    throw unavailable("credential_rotation");
  }

  async syncDesiredConfig(_agentId: string, _desiredRevision: string): Promise<ConfigSyncState> {
    throw unavailable("configuration_sync");
  }

  async deployOtaRollout(_targetVersion: string, _packageSha256: string, _signatureBase64: string): Promise<OtaUpdateRollout> {
    throw unavailable("ota_rollout");
  }

  listDiscoveryReports(agentId: string): DeviceDiscoveryReport[] {
    return this.discoveryReports.get(agentId) ?? [];
  }
}

export const branchEdgeOrchestratorService = new BranchEdgeOrchestratorService();
