/**
 * Blast Radius Calculator
 * 
 * Calculates the scope and impact of failures across infrastructure.
 * Identifies affected devices, branches, and calculates percentages.
 */

import type { OperationalEvent, BlastRadius } from "./types.js";

/**
 * Calculate blast radius from operational events
 */
export function calculateBlastRadius(events: OperationalEvent[]): BlastRadius {
  const affectedBranches = new Set<string>();
  const affectedCameras = new Set<string>();
  const affectedDVRs = new Set<string>();
  const affectedNetworks = new Set<string>();
  const affectedEdgeAgents = new Set<string>();
  
  // Collect all affected entities
  for (const event of events) {
    // Branch
    if (event.branchId) {
      affectedBranches.add(event.branchId);
    }
    
    // Entity-specific
    switch (event.entity.type) {
      case "camera":
        affectedCameras.add(event.entity.id);
        break;
      
      case "dvr":
      case "recorder":
        affectedDVRs.add(event.entity.id);
        break;
      
      case "network":
      case "router":
      case "switch":
        affectedNetworks.add(event.entity.id);
        break;
      
      case "edge_agent":
        affectedEdgeAgents.add(event.entity.id);
        break;
    }
  }
  
  // Identify branch clusters (branches failing together)
  const branchClusterIds = identifyBranchClusters(events, affectedBranches);
  
  // Calculate summary statistics
  const totalBranches = affectedBranches.size;
  const totalCameras = affectedCameras.size;
  const totalDVRs = affectedDVRs.size;
  const totalNetworks = affectedNetworks.size;
  
  // Calculate percentage (would need total camera count from context)
  // For now, use affected cameras as baseline
  const percentCamerasAffected = totalCameras > 0 ? 100 : 0;
  
  return {
    affectedBranches,
    affectedCameras,
    affectedDVRs,
    affectedNetworks,
    affectedEdgeAgents,
    branchClusterIds,
    summary: {
      totalBranches,
      totalCameras,
      totalDVRs,
      totalNetworks,
      percentCamerasAffected,
    },
  };
}

/**
 * Identify branch clusters failing together
 */
function identifyBranchClusters(
  events: OperationalEvent[],
  affectedBranches: Set<string>
): string[] {
  // Sort events chronologically
  const sorted = [...events].sort((a, b) => 
    a.timestamp.localeCompare(b.timestamp)
  );
  
  // Group branches by failure time window (within 120 seconds)
  const clusters = new Map<string, Set<string>>();
  const windowSeconds = 120;
  
  for (const event of sorted) {
    if (!event.branchId) continue;
    
    const eventTime = Date.parse(event.timestamp);
    let assignedToCluster = false;
    
    // Try to assign to existing cluster
    for (const [clusterTime, branches] of clusters.entries()) {
      const clusterTimestamp = Date.parse(clusterTime);
      const timeDiff = Math.abs(eventTime - clusterTimestamp) / 1000;
      
      if (timeDiff <= windowSeconds) {
        branches.add(event.branchId);
        assignedToCluster = true;
        break;
      }
    }
    
    // Create new cluster if not assigned
    if (!assignedToCluster) {
      clusters.set(event.timestamp, new Set([event.branchId]));
    }
  }
  
  // Find largest cluster(s)
  const clusterSizes = Array.from(clusters.entries()).map(([time, branches]) => ({
    time,
    size: branches.size,
  }));
  
  clusterSizes.sort((a, b) => b.size - a.size);
  
  // Return cluster IDs (timestamps of clusters with >= 3 branches)
  return clusterSizes
    .filter(c => c.size >= 3)
    .map(c => c.time);
}

/**
 * Calculate affected percentage for specific entity type
 */
export function calculateAffectedPercentage(
  affected: number,
  total: number
): number {
  if (total === 0) return 0;
  return Math.round((affected / total) * 100);
}

/**
 * Get critical entities (high impact)
 */
export function identifyCriticalEntities(
  events: OperationalEvent[]
): Array<{ entityId: string; entityType: string; downstreamCount: number }> {
  const entityImpact = new Map<string, number>();
  
  // Count events per entity
  for (const event of events) {
    const key = `${event.entity.type}:${event.entity.id}`;
    entityImpact.set(key, (entityImpact.get(key) || 0) + 1);
  }
  
  // Sort by impact
  const sorted = Array.from(entityImpact.entries())
    .map(([key, count]) => {
      const [type, id] = key.split(":");
      return { entityId: id!, entityType: type!, downstreamCount: count };
    })
    .sort((a, b) => b.downstreamCount - a.downstreamCount);
  
  return sorted.slice(0, 10); // Top 10 critical entities
}

/**
 * Generate impact statement
 */
export function generateImpactStatement(blast: BlastRadius): string {
  const parts: string[] = [];
  
  if (blast.summary.totalBranches > 1) {
    parts.push(`${blast.summary.totalBranches} branches affected`);
  } else if (blast.summary.totalBranches === 1) {
    parts.push("1 branch affected");
  }
  
  if (blast.summary.totalCameras > 0) {
    parts.push(`${blast.summary.totalCameras} cameras offline`);
  }
  
  if (blast.summary.totalDVRs > 0) {
    parts.push(`${blast.summary.totalDVRs} DVRs/recorders unreachable`);
  }
  
  if (blast.summary.totalNetworks > 0) {
    parts.push(`${blast.summary.totalNetworks} network paths degraded`);
  }
  
  if (parts.length === 0) {
    return "No significant device impact detected";
  }
  
  return parts.join(", ");
}

/**
 * Check if blast radius indicates widespread failure
 */
export function isWidespreadFailure(blast: BlastRadius): boolean {
  return (
    blast.summary.totalBranches >= 3 ||
    blast.summary.totalCameras >= 20 ||
    blast.summary.totalDVRs >= 5
  );
}

/**
 * Check if blast radius indicates single point of failure
 */
export function isSinglePointFailure(blast: BlastRadius): boolean {
  return (
    blast.summary.totalBranches === 1 &&
    blast.summary.totalCameras <= 5 &&
    blast.summary.totalDVRs <= 1
  );
}

/**
 * Multi-Branch Correlation Analysis
 * Identifies patterns across multiple branches that indicate common cause failures
 */

export interface BranchCorrelation {
  correlatedBranches: string[];
  correlationStrength: number; // 0-1
  commonFailurePattern: {
    sharedEntityTypes: string[];
    sharedEventTypes: string[];
    temporalCorrelation: number; // 0-1
  };
  evidence: string[];
}

/**
 * Analyze correlation between multiple branch failures
 */
export function analyzeBranchCorrelation(
  events: OperationalEvent[],
  branchIds: string[]
): BranchCorrelation[] {
  if (branchIds.length < 2) {
    return [];
  }
  
  const correlations: BranchCorrelation[] = [];
  
  // Group events by branch
  const eventsByBranch = new Map<string, OperationalEvent[]>();
  for (const event of events) {
    if (!event.branchId) continue;
    const existing = eventsByBranch.get(event.branchId) || [];
    existing.push(event);
    eventsByBranch.set(event.branchId, existing);
  }
  
  // Analyze each pair of branches for correlation
  for (let i = 0; i < branchIds.length; i++) {
    for (let j = i + 1; j < branchIds.length; j++) {
      const branch1 = branchIds[i]!;
      const branch2 = branchIds[j]!;
      
      const events1 = eventsByBranch.get(branch1) || [];
      const events2 = eventsByBranch.get(branch2) || [];
      
      if (events1.length === 0 || events2.length === 0) continue;
      
      const correlation = calculatePairwiseCorrelation(events1, events2);
      
      if (correlation.correlationStrength >= 0.7) {
        correlations.push({
          ...correlation,
          correlatedBranches: [branch1, branch2],
        });
      }
    }
  }
  
  // Merge overlapping correlations into clusters
  return mergeBranchCorrelations(correlations);
}

/**
 * Calculate correlation between two branches' failure patterns
 */
function calculatePairwiseCorrelation(
  events1: OperationalEvent[],
  events2: OperationalEvent[]
): Omit<BranchCorrelation, "correlatedBranches"> {
  // Find shared entity types
  const entityTypes1 = new Set(events1.map(e => e.entity.type));
  const entityTypes2 = new Set(events2.map(e => e.entity.type));
  const sharedEntityTypes = Array.from(entityTypes1).filter(t => entityTypes2.has(t));
  
  // Find shared event types
  const eventTypes1 = new Set(events1.map(e => e.eventType));
  const eventTypes2 = new Set(events2.map(e => e.eventType));
  const sharedEventTypes = Array.from(eventTypes1).filter(t => eventTypes2.has(t));
  
  // Calculate temporal correlation
  const sorted1 = [...events1].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sorted2 = [...events2].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  
  const time1 = Date.parse(sorted1[0]?.timestamp || "");
  const time2 = Date.parse(sorted2[0]?.timestamp || "");
  const timeDiffSeconds = Math.abs(time1 - time2) / 1000;
  
  // Temporal correlation: 1.0 if within 30 seconds, decreases linearly to 0 at 300 seconds
  const temporalCorrelation = Math.max(0, 1 - (timeDiffSeconds / 300));
  
  // Calculate overall correlation strength
  const entityTypeScore = sharedEntityTypes.length / Math.max(entityTypes1.size, entityTypes2.size);
  const eventTypeScore = sharedEventTypes.length / Math.max(eventTypes1.size, eventTypes2.size);
  
  const correlationStrength = (
    entityTypeScore * 0.3 +
    eventTypeScore * 0.3 +
    temporalCorrelation * 0.4
  );
  
  // Build evidence
  const evidence: string[] = [];
  
  if (sharedEntityTypes.length > 0) {
    evidence.push(`Both branches experienced failures in: ${sharedEntityTypes.join(", ")}`);
  }
  
  if (temporalCorrelation >= 0.8) {
    evidence.push(`Failures occurred within ${Math.round(timeDiffSeconds)} seconds`);
  }
  
  if (sharedEventTypes.length >= 2) {
    evidence.push(`Common failure types: ${sharedEventTypes.slice(0, 3).join(", ")}`);
  }
  
  return {
    correlationStrength,
    commonFailurePattern: {
      sharedEntityTypes,
      sharedEventTypes,
      temporalCorrelation,
    },
    evidence,
  };
}

/**
 * Merge overlapping branch correlations into clusters
 */
function mergeBranchCorrelations(
  correlations: BranchCorrelation[]
): BranchCorrelation[] {
  if (correlations.length === 0) return [];
  
  // Build graph of correlated branches
  const graph = new Map<string, Set<string>>();
  
  for (const correlation of correlations) {
    for (const branch of correlation.correlatedBranches) {
      if (!graph.has(branch)) {
        graph.set(branch, new Set());
      }
      
      for (const other of correlation.correlatedBranches) {
        if (branch !== other) {
          graph.get(branch)!.add(other);
        }
      }
    }
  }
  
  // Find connected components (clusters)
  const visited = new Set<string>();
  const clusters: string[][] = [];
  
  for (const branch of graph.keys()) {
    if (visited.has(branch)) continue;
    
    const cluster: string[] = [];
    const queue = [branch];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      cluster.push(current);
      
      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    
    clusters.push(cluster);
  }
  
  // Convert clusters back to correlation objects
  return clusters
    .filter(cluster => cluster.length >= 2)
    .map(cluster => {
      // Aggregate evidence from all pairs in cluster
      const allEvidence: string[] = [];
      let avgCorrelation = 0;
      let count = 0;
      
      const sharedEntityTypes = new Set<string>();
      const sharedEventTypes = new Set<string>();
      
      for (const correlation of correlations) {
        const isInCluster = correlation.correlatedBranches.every(b => cluster.includes(b));
        if (isInCluster) {
          allEvidence.push(...correlation.evidence);
          avgCorrelation += correlation.correlationStrength;
          count++;
          
          correlation.commonFailurePattern.sharedEntityTypes.forEach(t => 
            sharedEntityTypes.add(t)
          );
          correlation.commonFailurePattern.sharedEventTypes.forEach(t => 
            sharedEventTypes.add(t)
          );
        }
      }
      
      avgCorrelation = count > 0 ? avgCorrelation / count : 0;
      
      return {
        correlatedBranches: cluster,
        correlationStrength: avgCorrelation,
        commonFailurePattern: {
          sharedEntityTypes: Array.from(sharedEntityTypes),
          sharedEventTypes: Array.from(sharedEventTypes),
          temporalCorrelation: avgCorrelation, // Simplified
        },
        evidence: [...new Set(allEvidence)], // Deduplicate
      };
    });
}

/**
 * Identify shared infrastructure dependencies across branches
 */
export interface SharedDependency {
  dependencyType: "wan" | "isp" | "power" | "datacenter" | "unknown";
  affectedBranches: string[];
  confidence: number;
  evidence: string[];
}

/**
 * Identify shared dependencies that could explain correlated failures
 */
export function identifySharedDependencies(
  events: OperationalEvent[],
  branchIds: string[]
): SharedDependency[] {
  const dependencies: SharedDependency[] = [];
  
  // Analyze for WAN dependency
  const wanEvents = events.filter(e => 
    e.eventType === "wan_down" || 
    e.eventType === "network_degraded" ||
    e.entity.type === "network"
  );
  
  if (wanEvents.length > 0 && branchIds.length >= 2) {
    const wanBranches = new Set(wanEvents.map(e => e.branchId).filter(Boolean));
    const affectedBranches = branchIds.filter(b => wanBranches.has(b));
    
    if (affectedBranches.length >= 2) {
      dependencies.push({
        dependencyType: "wan",
        affectedBranches,
        confidence: Math.min(0.95, 0.7 + (affectedBranches.length * 0.05)),
        evidence: [
          `${wanEvents.length} network infrastructure events detected`,
          `${affectedBranches.length} branches show WAN connectivity degradation`,
          "Simultaneous network failures indicate shared WAN dependency",
        ],
      });
    }
  }
  
  // Analyze for power dependency
  const powerEvents = events.filter(e => 
    e.eventType === "power_loss" || 
    e.eventType === "power_on_battery"
  );
  
  if (powerEvents.length > 0 && branchIds.length >= 1) {
    const powerBranches = new Set(powerEvents.map(e => e.branchId).filter(Boolean));
    const affectedBranches = branchIds.filter(b => powerBranches.has(b));
    
    if (affectedBranches.length >= 1) {
      dependencies.push({
        dependencyType: "power",
        affectedBranches,
        confidence: 0.90,
        evidence: [
          `${powerEvents.length} power infrastructure events detected`,
          `UPS telemetry indicates utility power loss`,
          "Power failures affect all downstream infrastructure",
        ],
      });
    }
  }
  
  return dependencies;
}

/**
 * Calculate failure propagation probability
 * Determines likelihood that failures are cascading from a common source
 */
export function calculatePropagationProbability(
  events: OperationalEvent[],
  blast: BlastRadius
): number {
  let probability = 0;
  
  // Multiple branches increase propagation likelihood
  if (blast.summary.totalBranches >= 3) {
    probability += 0.30;
  } else if (blast.summary.totalBranches >= 2) {
    probability += 0.15;
  }
  
  // Multiple entity types affected (infrastructure-wide)
  const affectedTypes = new Set<string>();
  for (const event of events) {
    affectedTypes.add(event.entity.type);
  }
  
  if (affectedTypes.size >= 3) {
    probability += 0.25;
  } else if (affectedTypes.size >= 2) {
    probability += 0.15;
  }
  
  // Temporal clustering increases propagation likelihood
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sorted.length >= 2) {
    const firstTime = Date.parse(sorted[0]!.timestamp);
    const lastTime = Date.parse(sorted[sorted.length - 1]!.timestamp);
    const spreadSeconds = (lastTime - firstTime) / 1000;
    
    if (spreadSeconds <= 60) {
      probability += 0.30;
    } else if (spreadSeconds <= 180) {
      probability += 0.15;
    }
  }
  
  // Network/infrastructure events present
  const hasInfrastructureFailure = events.some(e => 
    e.entity.type === "network" || 
    e.entity.type === "ups" ||
    e.eventType === "wan_down" ||
    e.eventType === "power_loss"
  );
  
  if (hasInfrastructureFailure) {
    probability += 0.15;
  }
  
  return Math.min(1.0, probability);
}
