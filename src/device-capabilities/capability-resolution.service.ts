/**
 * Capability Resolution Service
 * 
 * Resolves capability observations from multiple probes into a unified capability set.
 * Implements precedence rules and evidence merging.
 */

import type {
  Capability,
  CapabilityEvidence,
  CapabilitySource,
  CapabilityState,
  CapabilityVerificationLevel,
  DeviceCapabilitySet,
  EvidenceFreshness,
} from "./capability.types.js";
import type { CapabilityObservation } from "./capability-probe.interface.js";

/**
 * Source precedence for conflict resolution (higher = more trusted).
 */
const SOURCE_PRECEDENCE: Record<CapabilitySource, number> = {
  MANUAL: 100, // Manual override has highest precedence
  DEVICE_PROBE: 90, // Runtime verification
  RTSP: 85, // Direct protocol verification
  VENDOR_API: 80, // Vendor-specific API
  ONVIF: 75, // Standard protocol
  SNMP: 70, // Network management protocol
  EDGE_AGENT: 65, // Edge agent observation
  MODEL_DATABASE: 50, // Model/specification database
  INFERRED: 10, // Inferred from other capabilities
};

/**
 * Verification level precedence (higher = more trusted).
 */
const VERIFICATION_PRECEDENCE: Record<CapabilityVerificationLevel, number> = {
  VERIFIED: 3,
  DISCOVERED: 2,
  DECLARED: 1,
};

/**
 * Evidence freshness TTL by source (in seconds).
 */
const EVIDENCE_TTL: Record<CapabilitySource, number> = {
  MANUAL: 86400 * 365, // 1 year
  MODEL_DATABASE: 86400 * 90, // 90 days
  ONVIF: 86400, // 1 day
  VENDOR_API: 86400, // 1 day
  SNMP: 3600, // 1 hour
  RTSP: 300, // 5 minutes
  DEVICE_PROBE: 300, // 5 minutes
  EDGE_AGENT: 300, // 5 minutes
  INFERRED: 3600, // 1 hour
};

export class CapabilityResolutionService {
  /**
   * Resolve observations into a capability set.
   */
  async resolve(
    tenantId: string,
    deviceId: string,
    observations: CapabilityObservation[],
  ): Promise<DeviceCapabilitySet> {
    // Group observations by capability path
    const grouped = this.groupObservations(observations);

    // Build capability set
    const capabilitySet: DeviceCapabilitySet = {
      deviceId,
      tenantId,
      lastUpdatedAt: new Date(),
    };

    // Resolve each capability
    for (const [path, obs] of grouped.entries()) {
      const capability = this.resolveCapability(obs);
      this.setCapabilityByPath(capabilitySet, path, capability);
    }

    return capabilitySet;
  }

  /**
   * Merge new observations with existing capabilities.
   */
  async merge(
    existing: DeviceCapabilitySet,
    observations: CapabilityObservation[],
  ): Promise<DeviceCapabilitySet> {
    // Group observations
    const grouped = this.groupObservations(observations);

    // Clone existing set
    const merged = { ...existing, lastUpdatedAt: new Date() };

    // Merge each capability
    for (const [path, obs] of grouped.entries()) {
      const existingCap = this.getCapabilityByPath(merged, path);
      const newCap = this.resolveCapability(obs);

      // Merge evidence
      if (existingCap) {
        const mergedCap = this.mergeCapabilities(existingCap, newCap);
        this.setCapabilityByPath(merged, path, mergedCap);
      } else {
        this.setCapabilityByPath(merged, path, newCap);
      }
    }

    return merged;
  }

  // ============ PRIVATE METHODS ============

  private groupObservations(
    observations: CapabilityObservation[],
  ): Map<string, CapabilityObservation[]> {
    const grouped = new Map<string, CapabilityObservation[]>();

    for (const obs of observations) {
      const existing = grouped.get(obs.capabilityPath) ?? [];
      existing.push(obs);
      grouped.set(obs.capabilityPath, existing);
    }

    return grouped;
  }

  private resolveCapability(observations: CapabilityObservation[]): Capability {
    if (observations.length === 0) {
      return this.createUnknownCapability();
    }

    // Collect all evidence
    const allEvidence: CapabilityEvidence[] = observations.map((obs) => obs.evidence);

    // Apply evidence freshness
    const freshEvidence = this.applyFreshness(allEvidence);

    // Determine state from evidence
    const state = this.determineState(freshEvidence);

    // Determine verification level
    const verificationLevel = this.determineVerificationLevel(freshEvidence);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(freshEvidence);

    // Determine availability
    const available = state === "SUPPORTED" && freshEvidence.length > 0;

    // Find most recent discovery and verification
    const sortedByDate = [...freshEvidence].sort(
      (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
    );

    const discoveredAt = sortedByDate[sortedByDate.length - 1]?.observedAt;
    const verifiedAt = sortedByDate.find((e) => e.verified)?.observedAt;

    // Collect limitations
    const limitations = this.collectLimitations(freshEvidence);

    // Extract value if present
    const value = observations.find((obs) => obs.value)?.value;

    return {
      state,
      available,
      confidence,
      verificationLevel,
      discoveredAt,
      verifiedAt,
      evidence: freshEvidence,
      limitations,
      attributes: value ? { value } : undefined,
    };
  }

  private mergeCapabilities(existing: Capability, incoming: Capability): Capability {
    // Merge evidence
    const mergedEvidence = this.mergeEvidence(existing.evidence, incoming.evidence);

    // Re-determine state from merged evidence
    const state = this.determineState(mergedEvidence);
    const verificationLevel = this.determineVerificationLevel(mergedEvidence);
    const confidence = this.calculateConfidence(mergedEvidence);
    const available = state === "SUPPORTED" && mergedEvidence.length > 0;

    const sortedByDate = [...mergedEvidence].sort(
      (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
    );

    const discoveredAt =
      existing.discoveredAt ?? sortedByDate[sortedByDate.length - 1]?.observedAt;
    const verifiedAt = sortedByDate.find((e) => e.verified)?.observedAt ?? existing.verifiedAt;

    const limitations = this.collectLimitations(mergedEvidence);

    return {
      state,
      available,
      confidence,
      verificationLevel,
      discoveredAt,
      verifiedAt,
      evidence: mergedEvidence,
      limitations,
      attributes: incoming.attributes ?? existing.attributes,
    };
  }

  private mergeEvidence(
    existing: CapabilityEvidence[],
    incoming: CapabilityEvidence[],
  ): CapabilityEvidence[] {
    const merged = [...existing];

    for (const evidence of incoming) {
      // Check if this evidence already exists
      const existingIndex = merged.findIndex(
        (e) =>
          e.source === evidence.source &&
          e.evidenceType === evidence.evidenceType &&
          Math.abs(e.observedAt.getTime() - evidence.observedAt.getTime()) < 1000,
      );

      if (existingIndex >= 0) {
        // Replace with newer evidence
        merged[existingIndex] = evidence;
      } else {
        merged.push(evidence);
      }
    }

    // Apply freshness
    return this.applyFreshness(merged);
  }

  private determineState(evidence: CapabilityEvidence[]): CapabilityState {
    if (evidence.length === 0) {
      return "UNKNOWN";
    }

    // Sort by precedence
    const sorted = this.sortByPrecedence(evidence);

    // Get highest precedence evidence
    const highest = sorted[0];

    // Check for explicit unsupported evidence
    const hasUnsupported = evidence.some(
      (e) => e.reason?.toLowerCase().includes("unsupported") || e.confidence === 0,
    );

    if (hasUnsupported) {
      return "UNSUPPORTED";
    }

    // Check for unavailable evidence
    const hasUnavailable = evidence.some((e) =>
      e.reason?.toLowerCase().includes("unavailable"),
    );

    if (hasUnavailable && highest?.verified) {
      return "UNAVAILABLE";
    }

    // Check for degraded evidence
    const hasDegraded = evidence.some((e) => e.reason?.toLowerCase().includes("degraded"));

    if (hasDegraded) {
      return "DEGRADED";
    }

    // If verified with high confidence, mark as supported
    if (highest?.verified && (highest?.confidence ?? 0) >= 0.7) {
      return "SUPPORTED";
    }

    // If discovered with reasonable confidence, mark as supported
    if ((highest?.confidence ?? 0) >= 0.5) {
      return "SUPPORTED";
    }

    return "UNKNOWN";
  }

  private determineVerificationLevel(
    evidence: CapabilityEvidence[],
  ): CapabilityVerificationLevel {
    if (evidence.length === 0) {
      return "DECLARED";
    }

    // Check for verified evidence
    if (evidence.some((e) => e.verified)) {
      return "VERIFIED";
    }

    // Check for discovery evidence
    const hasDiscovery = evidence.some(
      (e) =>
        e.source === "ONVIF" ||
        e.source === "VENDOR_API" ||
        e.source === "RTSP" ||
        e.source === "SNMP",
    );

    if (hasDiscovery) {
      return "DISCOVERED";
    }

    return "DECLARED";
  }

  private calculateConfidence(evidence: CapabilityEvidence[]): number {
    if (evidence.length === 0) {
      return 0;
    }

    // Weighted average based on source precedence
    let totalWeight = 0;
    let totalConfidence = 0;

    for (const e of evidence) {
      const weight = SOURCE_PRECEDENCE[e.source] ?? 1;
      totalWeight += weight;
      totalConfidence += e.confidence * weight;
    }

    return totalWeight > 0 ? totalConfidence / totalWeight : 0;
  }

  private collectLimitations(evidence: CapabilityEvidence[]): string[] {
    const limitations = new Set<string>();

    for (const e of evidence) {
      if (e.reason && e.confidence < 1.0) {
        limitations.add(e.reason);
      }
    }

    return Array.from(limitations);
  }

  private sortByPrecedence(evidence: CapabilityEvidence[]): CapabilityEvidence[] {
    return [...evidence].sort((a, b) => {
      // First by source precedence
      const precedenceDiff =
        (SOURCE_PRECEDENCE[b.source] ?? 0) - (SOURCE_PRECEDENCE[a.source] ?? 0);
      if (precedenceDiff !== 0) return precedenceDiff;

      // Then by verification status
      const verificationDiff = (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
      if (verificationDiff !== 0) return verificationDiff;

      // Then by confidence
      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      // Finally by recency
      return b.observedAt.getTime() - a.observedAt.getTime();
    });
  }

  private applyFreshness(evidence: CapabilityEvidence[]): CapabilityEvidence[] {
    const now = Date.now();

    return evidence.map((e) => {
      const ttl = EVIDENCE_TTL[e.source] ?? 3600;
      const expiresAt = e.expiresAt ?? new Date(e.observedAt.getTime() + ttl * 1000);
      const age = (now - e.observedAt.getTime()) / 1000;

      let freshness: EvidenceFreshness;
      if (now >= expiresAt.getTime()) {
        freshness = "EXPIRED";
      } else if (age > ttl * 0.8) {
        freshness = "STALE";
      } else {
        freshness = "FRESH";
      }

      return {
        ...e,
        expiresAt,
        freshness,
      };
    });
  }

  private createUnknownCapability(): Capability {
    return {
      state: "UNKNOWN",
      available: false,
      confidence: 0,
      verificationLevel: "DECLARED",
      evidence: [],
    };
  }

  private getCapabilityByPath(
    capabilitySet: DeviceCapabilitySet,
    path: string,
  ): Capability | undefined {
    const parts = path.split(".");
    let current: any = capabilitySet;

    for (const part of parts) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = current[part];
    }

    if (current && typeof current === "object" && "state" in current) {
      return current as Capability;
    }

    return undefined;
  }

  private setCapabilityByPath(
    capabilitySet: DeviceCapabilitySet,
    path: string,
    capability: Capability,
  ): void {
    const parts = path.split(".");
    let current: any = capabilitySet;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = capability;
    }
  }
}
