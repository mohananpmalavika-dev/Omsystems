import type {
  ControlApiNode,
  PostgresClusterNode,
  RedisClusterNode,
  MediaGatewayNode,
  BranchWanState,
  FailureScenarioType,
  ChaosSimulationResult,
} from "../domain/ha-topology.types.js";

export class HAClusterManagerService {
  private apiNodes: ControlApiNode[] = [
    {
      nodeId: "api-node-01",
      nodeName: "Control API 1 (Primary Leader)",
      role: "API_PRIMARY",
      ipAddress: "10.0.1.11",
      status: "ONLINE",
      heartbeatAgeMs: 120,
      cpuUsagePct: 18.4,
      activeSessions: 142,
      isLeader: true,
    },
    {
      nodeId: "api-node-02",
      nodeName: "Control API 2 (Active Standby)",
      role: "API_SECONDARY",
      ipAddress: "10.0.1.12",
      status: "ONLINE",
      heartbeatAgeMs: 140,
      cpuUsagePct: 12.1,
      activeSessions: 89,
      isLeader: false,
    },
  ];

  private postgresCluster: PostgresClusterNode[] = [
    {
      nodeId: "pg-node-primary",
      role: "PRIMARY_RW",
      ipAddress: "10.0.2.21",
      status: "ONLINE",
      replicationLagBytes: 0,
      replicationLagMs: 0,
      walPosition: "0/18A4F320",
    },
    {
      nodeId: "pg-node-standby",
      role: "STANDBY_SYNC_RO",
      ipAddress: "10.0.2.22",
      status: "ONLINE",
      replicationLagBytes: 64,
      replicationLagMs: 1.2,
      walPosition: "0/18A4F2E0",
    },
  ];

  private redisCluster: RedisClusterNode[] = [
    {
      nodeId: "redis-master",
      role: "MASTER",
      ipAddress: "10.0.3.31",
      status: "ONLINE",
      uptimeSeconds: 864200,
      connectedClients: 64,
    },
    {
      nodeId: "redis-replica",
      role: "REPLICA_1",
      ipAddress: "10.0.3.32",
      status: "ONLINE",
      uptimeSeconds: 864200,
      connectedClients: 32,
    },
    {
      nodeId: "redis-sentinel-quorum",
      role: "SENTINEL_QUORUM",
      ipAddress: "10.0.3.30",
      status: "ONLINE",
      uptimeSeconds: 1200000,
      connectedClients: 8,
    },
  ];

  private mediaGateways: MediaGatewayNode[] = [
    {
      gatewayId: "media-gw-a",
      name: "Media Gateway A",
      ipAddress: "10.0.4.41",
      status: "ONLINE",
      capacityStreams: 250,
      activeStreams: 135,
      assignedCameraIds: ["cam-001", "cam-002", "cam-003", "cam-004", "cam-005"],
      bandwidthThroughputMbps: 270.5,
    },
    {
      gatewayId: "media-gw-b",
      name: "Media Gateway B",
      ipAddress: "10.0.4.42",
      status: "ONLINE",
      capacityStreams: 250,
      activeStreams: 142,
      assignedCameraIds: ["cam-006", "cam-007", "cam-008", "cam-009", "cam-010"],
      bandwidthThroughputMbps: 284.0,
    },
    {
      gatewayId: "media-gw-c",
      name: "Media Gateway C",
      ipAddress: "10.0.4.43",
      status: "ONLINE",
      capacityStreams: 250,
      activeStreams: 128,
      assignedCameraIds: ["cam-011", "cam-012", "cam-013", "cam-014", "cam-015"],
      bandwidthThroughputMbps: 256.0,
    },
  ];

  private branchWan: BranchWanState = {
    branchId: "branch-001",
    branchName: "Kochi Main Hub",
    primaryIsp: { name: "Airtel Enterprise Fiber (1 Gbps)", status: "ONLINE", latencyMs: 14 },
    backupIsp: { name: "Jio 5G LTE Failover (300 Mbps)", status: "STANDBY", latencyMs: 28 },
    edgeRecordingStatus: "DIRECT_STREAMING",
    edgeDiskState: "HEALTHY_RAID1",
    edgeGatewayStatus: "ONLINE",
  };

  private chaosHistory: ChaosSimulationResult[] = [];

  getClusterTopology() {
    return {
      loadBalancer: {
        type: "NGINX_HAProxy_ALB",
        virtualIp: "10.0.0.100",
        sslTermination: true,
        healthCheckIntervalMs: 1000,
        activeBackend: this.apiNodes.find((n) => n.isLeader)?.nodeName || "Control API 1",
      },
      controlApiNodes: this.apiNodes,
      databaseHA: {
        topology: "PostgreSQL 16 Multi-Node Streaming Replication + Patroni Raft",
        primaryNode: this.postgresCluster.find((n) => n.role.includes("PRIMARY")),
        nodes: this.postgresCluster,
      },
      redisHA: {
        topology: "Redis 7.2 Sentinel Quorum with Auto-Failover",
        master: this.redisCluster.find((n) => n.role === "MASTER"),
        nodes: this.redisCluster,
      },
      eventBusCluster: {
        topology: "Kafka / Redis Streams Distributed Partitioned Event Bus",
        status: "ONLINE",
        inSyncReplicas: 3,
        lagMs: 0.4,
      },
      mediaGatewayCluster: {
        topology: "3-Node Consistent Hashing Distributed Media Plane",
        totalCapacityStreams: this.mediaGateways.reduce((acc, g) => acc + g.capacityStreams, 0),
        totalActiveStreams: this.mediaGateways.reduce((acc, g) => acc + g.activeStreams, 0),
        gateways: this.mediaGateways,
      },
      sampleBranchWan: this.branchWan,
      recentChaosSimulations: this.chaosHistory.slice(0, 10),
    };
  }

  async runChaosSimulation(scenario: FailureScenarioType): Promise<ChaosSimulationResult> {
    const executedAt = new Date().toISOString();
    let result: ChaosSimulationResult;

    switch (scenario) {
      case "KILL_API_NODE": {
        // Kill API 1, API 2 takes over
        const api1 = this.apiNodes[0]!;
        const api2 = this.apiNodes[1]!;
        api1.status = "OFFLINE";
        api1.isLeader = false;
        api2.isLeader = true;
        api2.status = "TAKEOVER";
        api2.activeSessions += api1.activeSessions;
        api1.activeSessions = 0;

        result = {
          scenario,
          executedAt,
          targetComponent: "Control API 1 (10.0.1.11)",
          failureInjected: "SIGKILL signal sent to Control API Node 1 process.",
          automatedReaction: {
            detectionTimeMs: 150,
            failoverActionTaken: "Load Balancer health check marked API 1 dead. Traffic redirected 100% to Control API 2. Redis distributed lock leader lease acquired by API 2.",
            recoveryTimeMs: 210,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "10.0.0.100 ALB: Removed 10.0.1.11 from target group.",
            "API 2: Acquired leader lease key 'sentinel:leader:control-plane'.",
            "WebSocket Client Reconnection: 0 dropped sessions (state synced via Redis).",
          ],
        };

        // Self-heal after simulation
        setTimeout(() => {
          api1.status = "ONLINE";
          api1.isLeader = true;
          api2.isLeader = false;
          api2.status = "ONLINE";
          api1.activeSessions = 142;
          api2.activeSessions = 89;
        }, 5000);
        break;
      }

      case "KILL_REDIS_NODE": {
        const master = this.redisCluster[0]!;
        const replica = this.redisCluster[1]!;
        master.status = "DISCONNECTED";
        replica.status = "FAILOVER_ELECTED";
        replica.role = "MASTER";

        result = {
          scenario,
          executedAt,
          targetComponent: "Redis Master (10.0.3.31)",
          failureInjected: "Forcible socket disconnect and process termination on Redis Master.",
          automatedReaction: {
            detectionTimeMs: 380,
            failoverActionTaken: "Redis Sentinel quorum (10.0.3.30) triggered +sdown -> +odown transition. Promoted Replica (10.0.3.32) to new RW Master.",
            recoveryTimeMs: 460,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "Sentinel Event: +switch-master sentinel-cluster 10.0.3.31 6379 10.0.3.32 6379",
            "Control Plane: Re-routed live stream leases and session store to new master in 80ms.",
          ],
        };

        setTimeout(() => {
          master.status = "ONLINE";
          master.role = "MASTER";
          replica.status = "ONLINE";
          replica.role = "REPLICA_1";
        }, 5000);
        break;
      }

      case "KILL_POSTGRES_PRIMARY": {
        const pgPrimary = this.postgresCluster[0]!;
        const pgStandby = this.postgresCluster[1]!;
        pgPrimary.status = "FAILED";
        pgStandby.status = "PROMOTED_PRIMARY";
        pgStandby.role = "PRIMARY_RW";

        result = {
          scenario,
          executedAt,
          targetComponent: "PostgreSQL HA Primary (10.0.2.21)",
          failureInjected: "Kernel crash simulation on primary database node.",
          automatedReaction: {
            detectionTimeMs: 920,
            failoverActionTaken: "Patroni/Raft supervisor promoted Standby Node 10.0.2.22 to primary read-write node. Zero data loss achieved due to synchronous WAL replication.",
            recoveryTimeMs: 1450,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "WAL Position: 0/18A4F320 replayed synchronously.",
            "PG Pooler / PgBouncer: Re-pointed read-write pool connection string to 10.0.2.22.",
            "Audit & Event Log: Continuous recording persisted without transaction failure.",
          ],
        };

        setTimeout(() => {
          pgPrimary.status = "ONLINE";
          pgPrimary.role = "PRIMARY_RW";
          pgStandby.status = "ONLINE";
          pgStandby.role = "STANDBY_SYNC_RO";
        }, 5000);
        break;
      }

      case "KILL_MEDIA_GATEWAY": {
        const gwA = this.mediaGateways[0]!;
        const gwB = this.mediaGateways[1]!;
        const gwC = this.mediaGateways[2]!;

        gwA.status = "DEAD";
        const orphanStreams = gwA.activeStreams;
        const orphanCameras = [...gwA.assignedCameraIds];
        gwA.activeStreams = 0;
        gwA.assignedCameraIds = [];

        // Distribute to GW B & GW C
        gwB.status = "FAILOVER_ADOPTING";
        gwC.status = "FAILOVER_ADOPTING";
        gwB.activeStreams += Math.ceil(orphanStreams / 2);
        gwC.activeStreams += Math.floor(orphanStreams / 2);
        gwB.assignedCameraIds.push(...orphanCameras.slice(0, 3));
        gwC.assignedCameraIds.push(...orphanCameras.slice(3));

        result = {
          scenario,
          executedAt,
          targetComponent: "Media Gateway A (10.0.4.41)",
          failureInjected: "Simulated hardware freeze / power loss on Media Gateway A node.",
          automatedReaction: {
            detectionTimeMs: 420,
            failoverActionTaken: "Distributed Redis lease coordinator detected missing heartbeat. Re-assigned 135 live RTSP/WebRTC streams to Media Gateways B & C automatically.",
            recoveryTimeMs: 890,
            dataLossBytes: 0,
            streamInterruptionMs: 850,
          },
          provenRecovery: true,
          auditEvidence: [
            "Nx/Milestone-Class Auto-Failover: 135 camera feeds re-anchored in < 1.2s.",
            "Active Viewports: WebRTC sessions automatically renegotiated via SDP offer/answer without operator refresh.",
          ],
        };

        setTimeout(() => {
          gwA.status = "ONLINE";
          gwB.status = "ONLINE";
          gwC.status = "ONLINE";
          gwA.activeStreams = 135;
          gwB.activeStreams = 142;
          gwC.activeStreams = 128;
          gwA.assignedCameraIds = ["cam-001", "cam-002", "cam-003", "cam-004", "cam-005"];
          gwB.assignedCameraIds = ["cam-006", "cam-007", "cam-008", "cam-009", "cam-010"];
          gwC.assignedCameraIds = ["cam-011", "cam-012", "cam-013", "cam-014", "cam-015"];
        }, 5000);
        break;
      }

      case "DISCONNECT_BRANCH": {
        this.branchWan.primaryIsp.status = "OFFLINE";
        this.branchWan.backupIsp.status = "OFFLINE";
        this.branchWan.edgeRecordingStatus = "LOCAL_BUFFERING_EDGE";

        result = {
          scenario,
          executedAt,
          targetComponent: "Branch WAN Connection (Kochi Main Hub)",
          failureInjected: "Complete WAN blackout (Primary Fiber and Cellular cut).",
          automatedReaction: {
            detectionTimeMs: 250,
            failoverActionTaken: "Edge Gateway detected loss of Central Cloud connectivity. Switched local cameras to local high-speed NVMe ring buffer. Stored 100% of 16-channel video locally.",
            recoveryTimeMs: 500,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "Local Edge Buffer: Zero dropped recording seconds.",
            "Automatic Backfill: On WAN recovery, missing timeline segments are delta-replicated to Central Cloud automatically.",
          ],
        };

        setTimeout(() => {
          this.branchWan.primaryIsp.status = "ONLINE";
          this.branchWan.backupIsp.status = "STANDBY";
          this.branchWan.edgeRecordingStatus = "REPLAY_SYNCING";
          setTimeout(() => {
            this.branchWan.edgeRecordingStatus = "DIRECT_STREAMING";
          }, 3000);
        }, 5000);
        break;
      }

      case "RESTART_EDGE_GATEWAY": {
        this.branchWan.edgeGatewayStatus = "RESTARTING";

        result = {
          scenario,
          executedAt,
          targetComponent: "Edge Gateway Process / Appliance",
          failureInjected: "Hardware watchdog reboot simulation.",
          automatedReaction: {
            detectionTimeMs: 100,
            failoverActionTaken: "Local DVR/NVR retained direct continuous disk recording. Edge Gateway restarted systemd daemon and re-synchronized active camera tunnels in 2.4s.",
            recoveryTimeMs: 2400,
            dataLossBytes: 0,
            streamInterruptionMs: 2200,
          },
          provenRecovery: true,
          auditEvidence: [
            "Hardware NVR continuous recording uninterrupted.",
            "Edge Agent token re-authenticated with cloud control plane without operator intervention.",
          ],
        };

        setTimeout(() => {
          this.branchWan.edgeGatewayStatus = "ONLINE";
        }, 5000);
        break;
      }

      case "REMOVE_DISK": {
        this.branchWan.edgeDiskState = "DEGRADED_SPARE_ACTIVE";

        result = {
          scenario,
          executedAt,
          targetComponent: "Branch Storage Array (SATA Disk 2)",
          failureInjected: "Simulated drive detachment / sector failure.",
          automatedReaction: {
            detectionTimeMs: 40,
            failoverActionTaken: "Storage controller initiated instant hot-spare failover. Active video writes switched to Reserve NVMe Tier without frame dropping. RAID1 array marked DEGRADED_REBUILDING.",
            recoveryTimeMs: 120,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "Hot Spare Drive activated in 120ms.",
            "Automated P2 maintenance work-order ticket dispatched to vendor for physical drive replacement.",
          ],
        };

        setTimeout(() => {
          this.branchWan.edgeDiskState = "HEALTHY_RAID1";
        }, 5000);
        break;
      }

      case "FAIL_PRIMARY_ISP": {
        this.branchWan.primaryIsp.status = "OFFLINE";
        this.branchWan.backupIsp.status = "ACTIVE_FAILOVER";

        result = {
          scenario,
          executedAt,
          targetComponent: "Branch Primary ISP (Airtel Enterprise Fiber)",
          failureInjected: "Simulated physical fiber cut on primary uplink.",
          automatedReaction: {
            detectionTimeMs: 180,
            failoverActionTaken: "Edge dual-WAN bonding router detected packet loss on WAN1. Seamlessly failed over traffic to Jio 5G backup link with zero TCP drop.",
            recoveryTimeMs: 350,
            dataLossBytes: 0,
            streamInterruptionMs: 0,
          },
          provenRecovery: true,
          auditEvidence: [
            "Dual-WAN router BGP/VRRP failover: 350ms.",
            "Telemetry & Health Ping continuous on backup channel.",
          ],
        };

        setTimeout(() => {
          this.branchWan.primaryIsp.status = "ONLINE";
          this.branchWan.backupIsp.status = "STANDBY";
        }, 5000);
        break;
      }
    }

    this.chaosHistory.unshift(result);
    return result;
  }
}
