/**
 * Enhanced Root Cause Analysis Service
 * Integrates Digital Twin for dependency-aware root cause determination
 */

import type { DigitalTwinBridge, TwinAsset, BlastRadiusResult } from './digital-twin-bridge.js';
import type { SecurityEvent, SecurityIncident } from '../types/index.js';

/**
 * Base root cause information
 */
export interface RootCause {
  confidence: number;
  explanation: string;
  contributingFactors: string[];
}

export interface EnhancedRootCause extends RootCause {
  primaryEventType: string;
  dependencyAnalysis?: {
    commonDependencies: TwinAsset[];
    singlePointsOfFailure: string[];
    blastRadius?: BlastRadiusResult;
    topologyContext: {
      failedAsset: TwinAsset | null;
      affectedAssets: TwinAsset[];
      dependencyChain: string[];
    };
  };
}

/**
 * Enhanced root cause analysis using Digital Twin infrastructure knowledge
 */
export class EnhancedRootCauseService {
  constructor(private readonly digitalTwinBridge: DigitalTwinBridge) {}

  /**
   * Analyze root cause with Digital Twin context
   */
  async analyzeRootCause(
    incident: SecurityIncident,
    events: SecurityEvent[]
  ): Promise<EnhancedRootCause> {
    // Extract asset IDs from events
    const assetIds = events
      .map((e) => e.assetId)
      .filter((id): id is string => id !== undefined);

    // Get unique asset IDs
    const uniqueAssetIds = Array.from(new Set(assetIds));

    // Find common dependencies
    const commonDependencies = await this.digitalTwinBridge.findCommonDependency(uniqueAssetIds);

    // Identify the most likely root cause asset
    const rootCauseAsset = await this.identifyRootCauseAsset(events, commonDependencies);

    // Calculate blast radius if we identified a root cause
    let blastRadius: BlastRadiusResult | null = null;
    if (rootCauseAsset) {
      blastRadius = await this.digitalTwinBridge.calculateBlastRadius(rootCauseAsset.id);
    }

    // Check for single points of failure
    const singlePointsOfFailure: string[] = [];
    for (const dep of commonDependencies) {
      const isSPOF = await this.digitalTwinBridge.isSinglePointOfFailure(dep.id);
      if (isSPOF) {
        singlePointsOfFailure.push(dep.id);
      }
    }

    // Get affected assets
    const affectedAssets: TwinAsset[] = [];
    for (const assetId of uniqueAssetIds) {
      const asset = await this.digitalTwinBridge.getAsset(assetId);
      if (asset) {
        affectedAssets.push(asset);
      }
    }

    // Build dependency chain
    const dependencyChain = this.buildDependencyChain(
      rootCauseAsset,
      commonDependencies,
      affectedAssets
    );

    // Determine primary event type and explanation
    const primaryEventType = this.determinePrimaryEventType(events);
    const explanation = this.generateExplanation(
      incident,
      events,
      rootCauseAsset,
      commonDependencies,
      blastRadius
    );

    // Calculate contributing factors
    const contributingFactors = this.identifyContributingFactors(
      events,
      rootCauseAsset,
      commonDependencies
    );

    // Calculate confidence
    const confidence = this.calculateRootCauseConfidence(
      events,
      commonDependencies,
      rootCauseAsset
    );

    return {
      primaryEventType,
      confidence,
      explanation,
      contributingFactors,
      dependencyAnalysis: {
        commonDependencies,
        singlePointsOfFailure,
        blastRadius: blastRadius || undefined,
        topologyContext: {
          failedAsset: rootCauseAsset,
          affectedAssets,
          dependencyChain,
        },
      },
    };
  }

  /**
   * Identify the root cause asset from events and dependencies
   */
  private async identifyRootCauseAsset(
    events: SecurityEvent[],
    commonDependencies: TwinAsset[]
  ): Promise<TwinAsset | null> {
    // Strategy 1: If there's a common dependency that failed, it's likely the root cause
    for (const dep of commonDependencies) {
      const hasFailureEvent = events.some(
        (e) => e.assetId === dep.id && this.isFailureEvent(e.eventType)
      );
      if (hasFailureEvent) {
        return dep;
      }
    }

    // Strategy 2: Find the earliest failing asset
    const sortedEvents = events.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const event of sortedEvents) {
      if (this.isFailureEvent(event.eventType) && event.assetId) {
        const asset = await this.digitalTwinBridge.getAsset(event.assetId);
        if (asset) {
          return asset;
        }
      }
    }

    // Strategy 3: Return first common dependency
    return commonDependencies[0] || null;
  }

  /**
   * Check if event type indicates a failure
   */
  private isFailureEvent(eventType: string): boolean {
    const failurePatterns = [
      'offline',
      'down',
      'failure',
      'error',
      'disconnected',
      'timeout',
      'unreachable',
      'degraded',
    ];

    return failurePatterns.some((pattern) => eventType.toLowerCase().includes(pattern));
  }

  /**
   * Build dependency chain showing how failure propagated
   */
  private buildDependencyChain(
    rootCause: TwinAsset | null,
    dependencies: TwinAsset[],
    affectedAssets: TwinAsset[]
  ): string[] {
    const chain: string[] = [];

    if (rootCause) {
      chain.push(`${rootCause.asset_type}: ${rootCause.name}`);
    }

    dependencies.forEach((dep) => {
      if (!rootCause || dep.id !== rootCause.id) {
        chain.push(`${dep.asset_type}: ${dep.name}`);
      }
    });

    affectedAssets.forEach((asset) => {
      const alreadyInChain = chain.some((item) => item.includes(asset.name));
      if (!alreadyInChain) {
        chain.push(`${asset.asset_type}: ${asset.name}`);
      }
    });

    return chain;
  }

  /**
   * Determine primary event type from events
   */
  private determinePrimaryEventType(events: SecurityEvent[]): string {
    // Count event types
    const eventTypeCounts = new Map<string, number>();
    events.forEach((event) => {
      eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) || 0) + 1);
    });

    // Find most common
    let primaryType = events[0]?.eventType || 'unknown';
    let maxCount = 0;

    eventTypeCounts.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        primaryType = type;
      }
    });

    return primaryType;
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    incident: SecurityIncident,
    events: SecurityEvent[],
    rootCause: TwinAsset | null,
    commonDependencies: TwinAsset[],
    blastRadius: BlastRadiusResult | null
  ): string {
    if (rootCause && blastRadius) {
      const downtimeEstimate = blastRadius.business_impact.estimated_downtime || 'unknown';
      return `Infrastructure failure detected: ${rootCause.asset_type} "${rootCause.name}" has failed, ` +
        `affecting ${blastRadius.total_affected} dependent assets including ` +
        `${blastRadius.by_type.camera || 0} cameras. ` +
        `This is causing ${incident.events.length} security events across multiple assets. ` +
        `Estimated recovery time: ${downtimeEstimate}.`;
    }

    if (commonDependencies.length > 0) {
      const depList = commonDependencies
        .slice(0, 3)
        .map((d) => `${d.asset_type} "${d.name}"`)
        .join(', ');
      return `Multiple assets affected by common dependencies: ${depList}. ` +
        `This suggests an infrastructure-level issue rather than individual asset failures.`;
    }

    return `Incident involves ${events.length} events across ${incident.affectedAssets.length} assets. ` +
      `Root cause analysis suggests correlated failures, but no single infrastructure dependency identified.`;
  }

  /**
   * Identify contributing factors
   */
  private identifyContributingFactors(
    events: SecurityEvent[],
    rootCause: TwinAsset | null,
    commonDependencies: TwinAsset[]
  ): string[] {
    const factors: string[] = [];

    // Factor 1: Temporal clustering
    const timeSpan = this.calculateTimeSpan(events);
    if (timeSpan < 300) {
      // 5 minutes
      factors.push(`Rapid failure cascade (${timeSpan}s) indicates infrastructure issue`);
    }

    // Factor 2: Asset health
    if (rootCause && rootCause.health_score < 60) {
      factors.push(`Root cause asset had degraded health score: ${rootCause.health_score}/100`);
    }

    // Factor 3: Single point of failure
    const spofDeps = commonDependencies.filter((d) => d.metadata?.isSinglePointOfFailure);
    if (spofDeps.length > 0) {
      factors.push(`Single point of failure detected: ${spofDeps[0].name}`);
    }

    // Factor 4: Geographic/zone clustering
    const zones = this.extractZones(events);
    if (zones.length === 1) {
      factors.push(`All affected assets in same zone: ${zones[0]}`);
    }

    // Factor 5: Similar event types
    const uniqueEventTypes = new Set(events.map((e) => e.eventType));
    if (uniqueEventTypes.size === 1) {
      factors.push(`All events of same type: ${Array.from(uniqueEventTypes)[0]}`);
    }

    return factors;
  }

  /**
   * Calculate confidence in root cause determination
   */
  private calculateRootCauseConfidence(
    events: SecurityEvent[],
    commonDependencies: TwinAsset[],
    rootCause: TwinAsset | null
  ): number {
    let confidence = 50; // Base confidence

    // Boost: Found root cause with failure event
    if (rootCause) {
      confidence += 20;
    }

    // Boost: Common dependencies identified
    if (commonDependencies.length > 0) {
      confidence += 15;
    }

    // Boost: Temporal clustering (events close in time)
    const timeSpan = this.calculateTimeSpan(events);
    if (timeSpan < 300) {
      confidence += 10;
    }

    // Boost: Spatial clustering (same zone/location)
    const zones = this.extractZones(events);
    if (zones.length <= 2) {
      confidence += 5;
    }

    return Math.min(confidence, 95); // Cap at 95%
  }

  /**
   * Calculate time span of events in seconds
   */
  private calculateTimeSpan(events: SecurityEvent[]): number {
    if (events.length < 2) return 0;

    const timestamps = events.map((e) => new Date(e.timestamp).getTime());
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);

    return (max - min) / 1000; // Convert to seconds
  }

  /**
   * Extract zones from events
   */
  private extractZones(events: SecurityEvent[]): string[] {
    const zones = new Set<string>();
    events.forEach((event) => {
      if (event.metadata?.zone) {
        zones.add(event.metadata.zone);
      }
      if (event.metadata?.location) {
        zones.add(event.metadata.location);
      }
    });
    return Array.from(zones);
  }
}
