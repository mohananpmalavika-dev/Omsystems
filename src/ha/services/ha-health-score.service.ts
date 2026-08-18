/**
 * HA Health Scoring Service
 * 
 * Calculates overall HA readiness from component health checks.
 * Provides drill-down into failing checks and actionable recommendations.
 */

import type {
  HAHealthScore,
  ComponentHealthScore,
  LoadBalancerHealth,
  ControlAPINodeHealth,
  PostgreSQLNodeHealth,
  RedisNodeHealth,
  MediaGatewayHealth,
  KafkaClusterHealth,
  EdgeGatewayHealth,
  StorageNodeHealth,
} from "../domain/ha-telemetry.types.js";

interface HealthCheckWeights {
  loadBalancer: number;
  controlPlane: number;
  database: number;
  redis: number;
  kafka: number;
  mediaPlane: number;
  edge: number;
  storage: number;
}

export class HAHealthScoreService {
  private weights: HealthCheckWeights;

  constructor(weights?: Partial<HealthCheckWeights>) {
    this.weights = {
      loadBalancer: weights?.loadBalancer ?? 10,
      controlPlane: weights?.controlPlane ?? 15,
      database: weights?.database ?? 20,
      redis: weights?.redis ?? 15,
      kafka: weights?.kafka ?? 10,
      mediaPlane: weights?.mediaPlane ?? 20,
      edge: weights?.edge ?? 5,
      storage: weights?.storage ?? 5,
    };
  }

  /**
   * Calculate comprehensive HA health score
   */
  calculateHealthScore(snapshot: {
    loadBalancer?: LoadBalancerHealth;
    controlPlane: ControlAPINodeHealth[];
    database: {
      primary?: PostgreSQLNodeHealth;
      standbys: PostgreSQLNodeHealth[];
    };
    redis: {
      master?: RedisNodeHealth;
      replicas: RedisNodeHealth[];
      sentinels: RedisNodeHealth[];
    };
    kafka?: KafkaClusterHealth;
    mediaGateways: MediaGatewayHealth[];
    edgeGateways: EdgeGatewayHealth[];
    storage: StorageNodeHealth[];
  }): HAHealthScore {
    const components = {
      loadBalancer: this.scoreLoadBalancer(snapshot.loadBalancer),
      controlPlane: this.scoreControlPlane(snapshot.controlPlane),
      database: this.scoreDatabase(snapshot.database),
      redis: this.scoreRedis(snapshot.redis),
      kafka: this.scoreKafka(snapshot.kafka),
      mediaPlane: this.scoreMediaPlane(snapshot.mediaGateways),
      edge: this.scoreEdgeGateways(snapshot.edgeGateways),
      storage: this.scoreStorage(snapshot.storage),
    };

    // Calculate weighted overall score
    const totalWeight = Object.values(this.weights).reduce((sum, w) => sum + w, 0);
    const weightedScore = Object.entries(components).reduce((sum, [key, component]) => {
      const weight = this.weights[key as keyof HealthCheckWeights] ?? 0;
      return sum + (component.score * weight);
    }, 0);

    const overallScore = Math.round(weightedScore / totalWeight);

    // Collect all failing checks
    const failingChecks: string[] = [];
    const warnings: string[] = [];

    for (const [componentName, component] of Object.entries(components)) {
      for (const check of component.checks) {
        if (!check.passed) {
          if (component.status === "critical") {
            failingChecks.push(`${componentName}: ${check.name} - ${check.message}`);
          } else if (component.status === "warning") {
            warnings.push(`${componentName}: ${check.name} - ${check.message}`);
          }
        }
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(components);

    // Determine overall status
    let status: HAHealthScore["status"];
    if (overallScore >= 90 && failingChecks.length === 0) {
      status = "healthy";
    } else if (overallScore >= 70 && failingChecks.length <= 2) {
      status = "degraded";
    } else {
      status = "critical";
    }

    return {
      overallScore,
      status,
      components,
      failingChecks,
      warnings,
      recommendations,
      calculatedAt: new Date().toISOString(),
    };
  }

  private scoreLoadBalancer(lb?: LoadBalancerHealth): ComponentHealthScore {
    if (!lb) {
      return {
        component: "Load Balancer",
        score: 0,
        status: "offline",
        weight: this.weights.loadBalancer,
        checks: [
          {
            name: "load-balancer-available",
            passed: false,
            message: "Load balancer not configured",
          },
        ],
      };
    }

    const checks = [
      {
        name: "lb-healthy",
        passed: lb.healthy,
        message: lb.healthy ? "Load balancer operational" : "Load balancer unhealthy",
      },
      {
        name: "backends-available",
        passed: lb.healthyBackends >= 2,
        value: lb.healthyBackends,
        threshold: 2,
        message: `${lb.healthyBackends}/${lb.totalBackends} backends healthy`,
      },
      {
        name: "error-rate",
        passed: lb.errorRate < 0.01,
        value: lb.errorRate,
        threshold: 0.01,
        message: `Error rate: ${(lb.errorRate * 100).toFixed(2)}%`,
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90) status = "healthy";
    else if (score >= 70) status = "warning";
    else status = "critical";

    return {
      component: "Load Balancer",
      score,
      status,
      weight: this.weights.loadBalancer,
      checks,
    };
  }

  private scoreControlPlane(nodes: ControlAPINodeHealth[]): ComponentHealthScore {
    if (nodes.length === 0) {
      return {
        component: "Control Plane",
        score: 0,
        status: "offline",
        weight: this.weights.controlPlane,
        checks: [
          {
            name: "api-nodes-available",
            passed: false,
            message: "No API nodes available",
          },
        ],
      };
    }

    const healthyNodes = nodes.filter((n) => n.status === "healthy");
    const reachableNodes = nodes.filter((n) => n.isReachable);

    const checks = [
      {
        name: "multiple-nodes",
        passed: nodes.length >= 2,
        value: nodes.length,
        threshold: 2,
        message: `${nodes.length} API node(s) configured`,
      },
      {
        name: "healthy-nodes",
        passed: healthyNodes.length >= 1,
        value: healthyNodes.length,
        threshold: 1,
        message: `${healthyNodes.length}/${nodes.length} nodes healthy`,
      },
      {
        name: "all-reachable",
        passed: reachableNodes.length === nodes.length,
        value: reachableNodes.length,
        threshold: nodes.length,
        message: `${reachableNodes.length}/${nodes.length} nodes reachable`,
      },
      {
        name: "low-error-rate",
        passed: nodes.every((n) => n.errorRate < 0.01),
        message: nodes.every((n) => n.errorRate < 0.01)
          ? "All nodes have low error rate"
          : "Some nodes have elevated error rate",
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90 && healthyNodes.length >= 2) status = "healthy";
    else if (score >= 70 && healthyNodes.length >= 1) status = "warning";
    else status = "critical";

    return {
      component: "Control Plane (Active-Active)",
      score,
      status,
      weight: this.weights.controlPlane,
      checks,
    };
  }

  private scoreDatabase(db: {
    primary?: PostgreSQLNodeHealth;
    standbys: PostgreSQLNodeHealth[];
  }): ComponentHealthScore {
    if (!db.primary) {
      return {
        component: "Database",
        score: 0,
        status: "critical",
        weight: this.weights.database,
        checks: [
          {
            name: "primary-available",
            passed: false,
            message: "No primary database available",
          },
        ],
      };
    }

    const healthyStandbys = db.standbys.filter((s) => s.status === "healthy");
    const syncStandbys = db.standbys.filter((s) => s.replicationMode === "synchronous");

    const checks = [
      {
        name: "primary-healthy",
        passed: db.primary.status === "healthy",
        message: `Primary database ${db.primary.status}`,
      },
      {
        name: "standby-available",
        passed: db.standbys.length >= 1,
        value: db.standbys.length,
        threshold: 1,
        message: `${db.standbys.length} standby node(s)`,
      },
      {
        name: "replication-active",
        passed: db.standbys.every((s) => s.replicationState === "streaming"),
        message: db.standbys.every((s) => s.replicationState === "streaming")
          ? "All standbys streaming"
          : "Some standbys not streaming",
      },
      {
        name: "low-replication-lag",
        passed: db.standbys.every((s) => s.replicationLagSeconds < 10),
        message: db.standbys.every((s) => s.replicationLagSeconds < 10)
          ? "Replication lag < 10s"
          : "High replication lag detected",
      },
      {
        name: "accepting-connections",
        passed: db.primary.isAcceptingConnections,
        message: db.primary.isAcceptingConnections
          ? "Primary accepting connections"
          : "Primary not accepting connections",
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90 && healthyStandbys.length >= 1) status = "healthy";
    else if (score >= 70 && db.primary.status === "healthy") status = "warning";
    else status = "critical";

    return {
      component: "PostgreSQL HA",
      score,
      status,
      weight: this.weights.database,
      checks,
    };
  }

  private scoreRedis(redis: {
    master?: RedisNodeHealth;
    replicas: RedisNodeHealth[];
    sentinels: RedisNodeHealth[];
  }): ComponentHealthScore {
    if (!redis.master) {
      return {
        component: "Redis",
        score: 0,
        status: "critical",
        weight: this.weights.redis,
        checks: [
          {
            name: "master-available",
            passed: false,
            message: "No Redis master available",
          },
        ],
      };
    }

    const healthyReplicas = redis.replicas.filter((r) => r.status === "healthy");
    const healthySentinels = redis.sentinels.filter((s) => s.status === "healthy");

    const checks = [
      {
        name: "master-healthy",
        passed: redis.master.status === "healthy",
        message: `Redis master ${redis.master.status}`,
      },
      {
        name: "replicas-available",
        passed: redis.replicas.length >= 1,
        value: redis.replicas.length,
        threshold: 1,
        message: `${redis.replicas.length} replica(s) configured`,
      },
      {
        name: "sentinels-quorum",
        passed: healthySentinels.length >= 3,
        value: healthySentinels.length,
        threshold: 3,
        message: `${healthySentinels.length}/3 sentinels healthy`,
      },
      {
        name: "replication-connected",
        passed: redis.replicas.every((r) => r.masterLinkStatus === "up"),
        message: redis.replicas.every((r) => r.masterLinkStatus === "up")
          ? "All replicas connected"
          : "Some replicas disconnected",
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90 && healthySentinels.length >= 3) status = "healthy";
    else if (score >= 70 && redis.master.status === "healthy") status = "warning";
    else status = "critical";

    return {
      component: "Redis Sentinel",
      score,
      status,
      weight: this.weights.redis,
      checks,
    };
  }

  private scoreKafka(kafka?: KafkaClusterHealth): ComponentHealthScore {
    if (!kafka) {
      return {
        component: "Kafka",
        score: 100,
        status: "healthy",
        weight: this.weights.kafka,
        checks: [
          {
            name: "kafka-optional",
            passed: true,
            message: "Kafka not configured (optional)",
          },
        ],
      };
    }

    const onlineBrokers = kafka.brokers.filter((b) => b.status === "online");

    const checks = [
      {
        name: "cluster-healthy",
        passed: kafka.status === "healthy",
        message: `Kafka cluster ${kafka.status}`,
      },
      {
        name: "brokers-online",
        passed: onlineBrokers.length >= 3,
        value: onlineBrokers.length,
        threshold: 3,
        message: `${onlineBrokers.length}/${kafka.brokers.length} brokers online`,
      },
      {
        name: "no-offline-partitions",
        passed: kafka.offlinePartitions === 0,
        value: kafka.offlinePartitions,
        threshold: 0,
        message: `${kafka.offlinePartitions} offline partitions`,
      },
      {
        name: "replication-healthy",
        passed: kafka.underReplicatedPartitions === 0,
        value: kafka.underReplicatedPartitions,
        threshold: 0,
        message: `${kafka.underReplicatedPartitions} under-replicated partitions`,
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90) status = "healthy";
    else if (score >= 70) status = "warning";
    else status = "critical";

    return {
      component: "Event Bus (Kafka)",
      score,
      status,
      weight: this.weights.kafka,
      checks,
    };
  }

  private scoreMediaPlane(gateways: MediaGatewayHealth[]): ComponentHealthScore {
    if (gateways.length === 0) {
      return {
        component: "Media Plane",
        score: 0,
        status: "critical",
        weight: this.weights.mediaPlane,
        checks: [
          {
            name: "gateways-configured",
            passed: false,
            message: "No media gateways configured",
          },
        ],
      };
    }

    const healthyGateways = gateways.filter((g) => g.status === "healthy");
    const totalCapacity = gateways.reduce((sum, g) => sum + g.capacityStreams, 0);
    const totalActive = gateways.reduce((sum, g) => sum + g.activeStreams, 0);
    const utilizationPercent = (totalActive / Math.max(totalCapacity, 1)) * 100;
    const totalFailed = gateways.reduce((sum, g) => sum + g.failedStreams, 0);

    const checks = [
      {
        name: "multiple-gateways",
        passed: gateways.length >= 3,
        value: gateways.length,
        threshold: 3,
        message: `${gateways.length} media gateway(s)`,
      },
      {
        name: "healthy-gateways",
        passed: healthyGateways.length >= 2,
        value: healthyGateways.length,
        threshold: 2,
        message: `${healthyGateways.length}/${gateways.length} gateways healthy`,
      },
      {
        name: "capacity-available",
        passed: utilizationPercent < 80,
        value: utilizationPercent,
        threshold: 80,
        message: `${utilizationPercent.toFixed(1)}% capacity utilized`,
      },
      {
        name: "no-failed-streams",
        passed: totalFailed === 0,
        value: totalFailed,
        threshold: 0,
        message: totalFailed === 0 ? "No failed streams" : `${totalFailed} failed streams`,
      },
      {
        name: "all-reachable",
        passed: gateways.every((g) => g.isReachable),
        message: gateways.every((g) => g.isReachable)
          ? "All gateways reachable"
          : "Some gateways unreachable",
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90 && healthyGateways.length >= 3) status = "healthy";
    else if (score >= 70 && healthyGateways.length >= 2) status = "warning";
    else status = "critical";

    return {
      component: "Media Plane",
      score,
      status,
      weight: this.weights.mediaPlane,
      checks,
    };
  }

  private scoreEdgeGateways(edges: EdgeGatewayHealth[]): ComponentHealthScore {
    if (edges.length === 0) {
      return {
        component: "Edge Gateways",
        score: 100,
        status: "healthy",
        weight: this.weights.edge,
        checks: [
          {
            name: "edge-optional",
            passed: true,
            message: "No edge gateways configured (optional for cloud-only)",
          },
        ],
      };
    }

    const onlineEdges = edges.filter((e) => e.status === "online");
    const bufferingEdges = edges.filter((e) => e.localRecordingStatus === "local-buffering");

    const checks = [
      {
        name: "edges-online",
        passed: onlineEdges.length === edges.length,
        value: onlineEdges.length,
        threshold: edges.length,
        message: `${onlineEdges.length}/${edges.length} edge gateways online`,
      },
      {
        name: "primary-isp-healthy",
        passed: edges.every((e) => e.primaryIsp.status === "online"),
        message: edges.every((e) => e.primaryIsp.status === "online")
          ? "All primary ISPs online"
          : "Some primary ISPs offline",
      },
      {
        name: "no-buffering",
        passed: bufferingEdges.length === 0,
        value: bufferingEdges.length,
        threshold: 0,
        message: bufferingEdges.length === 0
          ? "All edges streaming directly"
          : `${bufferingEdges.length} edges buffering locally`,
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90) status = "healthy";
    else if (score >= 70) status = "warning";
    else status = "critical";

    return {
      component: "Edge Gateways",
      score,
      status,
      weight: this.weights.edge,
      checks,
    };
  }

  private scoreStorage(storage: StorageNodeHealth[]): ComponentHealthScore {
    if (storage.length === 0) {
      return {
        component: "Storage",
        score: 0,
        status: "critical",
        weight: this.weights.storage,
        checks: [
          {
            name: "storage-configured",
            passed: false,
            message: "No storage nodes configured",
          },
        ],
      };
    }

    const healthyStorage = storage.filter((s) => s.status === "healthy");
    const degradedStorage = storage.filter((s) => s.status === "degraded");
    const avgUsedPercent = storage.reduce((sum, s) => sum + s.usedPercent, 0) / storage.length;

    const checks = [
      {
        name: "storage-healthy",
        passed: healthyStorage.length === storage.length,
        value: healthyStorage.length,
        threshold: storage.length,
        message: `${healthyStorage.length}/${storage.length} storage nodes healthy`,
      },
      {
        name: "no-degraded-arrays",
        passed: degradedStorage.length === 0,
        value: degradedStorage.length,
        threshold: 0,
        message: degradedStorage.length === 0
          ? "All storage arrays optimal"
          : `${degradedStorage.length} arrays degraded`,
      },
      {
        name: "capacity-available",
        passed: avgUsedPercent < 80,
        value: avgUsedPercent,
        threshold: 80,
        message: `${avgUsedPercent.toFixed(1)}% storage capacity used`,
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    let status: ComponentHealthScore["status"];
    if (score >= 90) status = "healthy";
    else if (score >= 70) status = "warning";
    else status = "critical";

    return {
      component: "Storage",
      score,
      status,
      weight: this.weights.storage,
      checks,
    };
  }

  private generateRecommendations(components: Record<string, ComponentHealthScore>): string[] {
    const recommendations: string[] = [];

    for (const [componentName, component] of Object.entries(components)) {
      if (component.status === "critical") {
        recommendations.push(`URGENT: Address ${componentName} critical issues immediately`);
      }

      // Specific recommendations based on component
      if (componentName === "controlPlane") {
        const healthyNodesCheck = component.checks.find((c) => c.name === "healthy-nodes");
        if (healthyNodesCheck && !healthyNodesCheck.passed) {
          recommendations.push("Deploy additional Control API nodes for redundancy");
        }
      }

      if (componentName === "database") {
        const lagCheck = component.checks.find((c) => c.name === "low-replication-lag");
        if (lagCheck && !lagCheck.passed) {
          recommendations.push("Investigate PostgreSQL replication lag - check network and disk I/O");
        }
      }

      if (componentName === "redis") {
        const quorumCheck = component.checks.find((c) => c.name === "sentinels-quorum");
        if (quorumCheck && !quorumCheck.passed) {
          recommendations.push("Deploy additional Redis Sentinel nodes to maintain quorum");
        }
      }

      if (componentName === "mediaPlane") {
        const capacityCheck = component.checks.find((c) => c.name === "capacity-available");
        if (capacityCheck && !capacityCheck.passed) {
          recommendations.push("Add media gateway capacity - utilization exceeds safe threshold");
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push("HA infrastructure is healthy - continue monitoring");
    }

    return recommendations;
  }
}
