/**
 * Media Placement & Capacity Scheduler Service
 * Assigns preferred media nodes across distinct failure domains based on capacity scoring
 */

import type { MediaNodeRegistry } from "./media-node-registry.js";
import type { MediaNodeInstance, CameraPlacementPlan } from "./camera-lease.types.js";

export class MediaPlacementService {
  private readonly plans = new Map<string, CameraPlacementPlan>();

  constructor(private readonly registry: MediaNodeRegistry) {}

  /**
   * Computes a 0-100 composite capacity score for a media node
   */
  calculateCapacityScore(node: MediaNodeInstance): number {
    if (node.status !== "HEALTHY") return 0;

    const streamHeadroomPct = Math.max(
      0,
      ((node.capacity.maxCameras - node.capacity.currentCameras) / node.capacity.maxCameras) * 100,
    );
    const cpuHeadroomPct = Math.max(0, 100 - node.capacity.cpuPct);
    const memHeadroomPct = Math.max(0, 100 - node.capacity.memoryPct);
    const bwHeadroomPct = Math.max(
      0,
      ((node.capacity.maxIngressMbps - node.capacity.ingressMbps) / node.capacity.maxIngressMbps) * 100,
    );

    // Weighted composite score
    return streamHeadroomPct * 0.4 + cpuHeadroomPct * 0.25 + memHeadroomPct * 0.15 + bwHeadroomPct * 0.2;
  }

  /**
   * Plans camera placement across independent failure domains
   */
  scheduleCamera(tenantId: string, cameraId: string, branchId: string): CameraPlacementPlan {
    const activeNodes = this.registry.listActiveNodes().filter((n) => n.status === "HEALTHY");

    // Sort by capacity score descending
    const scoredNodes = activeNodes
      .map((node) => ({ node, score: this.calculateCapacityScore(node) }))
      .sort((a, b) => b.score - a.score);

    if (scoredNodes.length === 0) {
      throw new Error("No healthy media nodes available in cluster");
    }

    const primary = scoredNodes[0]!.node;

    // Pick secondary from a different failure domain (different rack or datacenter)
    let secondary = scoredNodes.find(
      (s) =>
        s.node.nodeId !== primary.nodeId &&
        (s.node.failureDomain.rack !== primary.failureDomain.rack ||
          s.node.failureDomain.datacenter !== primary.failureDomain.datacenter),
    )?.node;

    if (!secondary && scoredNodes.length > 1) {
      secondary = scoredNodes[1]!.node;
    }
    if (!secondary) {
      secondary = primary;
    }

    // Pick tertiary (DR / remote DC if available)
    let tertiary = scoredNodes.find(
      (s) =>
        s.node.nodeId !== primary.nodeId &&
        s.node.nodeId !== secondary!.nodeId &&
        s.node.failureDomain.datacenter !== primary.failureDomain.datacenter,
    )?.node;

    if (!tertiary) {
      tertiary = scoredNodes.find((s) => s.node.nodeId !== primary.nodeId && s.node.nodeId !== secondary!.nodeId)?.node ?? secondary;
    }

    const plan: CameraPlacementPlan = {
      cameraId,
      tenantId,
      branchId,
      primaryNodeId: primary.nodeId,
      secondaryNodeId: secondary.nodeId,
      tertiaryNodeId: tertiary.nodeId,
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(`${tenantId}:${cameraId}`, plan);
    return plan;
  }

  getPlacementPlan(tenantId: string, cameraId: string): CameraPlacementPlan | undefined {
    return this.plans.get(`${tenantId}:${cameraId}`);
  }

  listPlacementPlans(tenantId?: string): CameraPlacementPlan[] {
    const results: CameraPlacementPlan[] = [];
    for (const plan of this.plans.values()) {
      if (!tenantId || plan.tenantId === tenantId) {
        results.push(plan);
      }
    }
    return results;
  }
}
