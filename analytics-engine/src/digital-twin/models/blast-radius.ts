/**
 * Digital Twin Blast Radius Models
 * 
 * Impact analysis and failure simulation models.
 */

import { AssetType, AssetStatus } from './asset';
import { RelationshipType } from './relationship';

/**
 * Impact of an asset failure
 */
export interface BlastRadius {
  // Source asset that failed
  sourceAssetId: string;
  sourceAssetName: string;
  sourceAssetType: AssetType;
  
  // Total affected assets
  totalAffected: number;
  
  // Breakdown by asset type
  byType: Record<AssetType, number>;
  
  // Breakdown by severity
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  
  // Affected branches/regions
  affectedBranches: string[];
  affectedRegions: string[];
  
  // Critical services impacted
  criticalServices: Array<{
    service: string;
    impact: string;
    affectedAssets: number;
  }>;
  
  // Detailed affected assets with dependency paths
  affectedAssets: AffectedAsset[];
  
  // Business impact
  businessImpact?: {
    coverageLoss?: string;
    complianceRisk?: boolean;
    operationalImpact?: string;
    estimatedDowntime?: string;
  };
  
  // Timestamp
  calculatedAt: Date;
}

/**
 * Individual affected asset in blast radius
 */
export interface AffectedAsset {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  
  // Dependency information
  dependencyDepth: number;
  dependencyPath: DependencyPathStep[];
  
  // Impact description
  impact: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  
  // Why this asset is affected
  reason: string;
}

/**
 * Step in a dependency path
 */
export interface DependencyPathStep {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  relationshipType: RelationshipType;
}

/**
 * Failure simulation request
 */
export interface FailureSimulation {
  assetId: string;
  failureType: 'offline' | 'degraded' | 'critical';
  duration?: string;
  
  // Optional cascade simulation
  cascadeFailures?: boolean;
  cascadeThreshold?: number;
}

/**
 * Failure simulation result
 */
export interface FailureSimulationResult {
  simulation: FailureSimulation;
  blastRadius: BlastRadius;
  
  // Predicted state changes
  predictedStateChanges: Array<{
    assetId: string;
    assetName: string;
    currentStatus: AssetStatus;
    predictedStatus: AssetStatus;
    reason: string;
  }>;
  
  // Mitigation suggestions
  mitigationSuggestions: string[];
  
  // Recovery time estimate
  estimatedRecoveryTime?: string;
}

/**
 * Impact summary for quick assessment
 */
export interface ImpactSummary {
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  affectedCount: number;
  criticalAssetsAffected: number;
  branchesAffected: number;
  
  headline: string;
  description: string;
}

/**
 * Helper to calculate impact level
 */
export function calculateImpactLevel(blastRadius: BlastRadius): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  const { totalAffected, bySeverity, affectedBranches } = blastRadius;
  
  if (bySeverity.critical > 10 || affectedBranches.length > 3) {
    return 'critical';
  }
  
  if (bySeverity.critical > 5 || bySeverity.high > 20 || affectedBranches.length > 1) {
    return 'high';
  }
  
  if (totalAffected > 10 || bySeverity.high > 5) {
    return 'medium';
  }
  
  if (totalAffected > 0) {
    return 'low';
  }
  
  return 'none';
}

/**
 * Create impact summary from blast radius
 */
export function createImpactSummary(blastRadius: BlastRadius): ImpactSummary {
  const level = calculateImpactLevel(blastRadius);
  const criticalCount = blastRadius.affectedAssets.filter(
    a => a.impactLevel === 'critical'
  ).length;
  
  let headline = '';
  let description = '';
  
  switch (level) {
    case 'critical':
      headline = `Critical Infrastructure Failure`;
      description = `${blastRadius.totalAffected} assets affected across ${blastRadius.affectedBranches.length} branches. ${criticalCount} critical services impacted.`;
      break;
    
    case 'high':
      headline = `Major Service Disruption`;
      description = `${blastRadius.totalAffected} assets affected. ${criticalCount} critical assets impacted.`;
      break;
    
    case 'medium':
      headline = `Moderate Service Impact`;
      description = `${blastRadius.totalAffected} assets affected with limited service disruption.`;
      break;
    
    case 'low':
      headline = `Minor Impact`;
      description = `${blastRadius.totalAffected} assets affected with minimal service impact.`;
      break;
    
    default:
      headline = `No Impact`;
      description = `No dependent assets affected.`;
  }
  
  return {
    level,
    affectedCount: blastRadius.totalAffected,
    criticalAssetsAffected: criticalCount,
    branchesAffected: blastRadius.affectedBranches.length,
    headline,
    description
  };
}

/**
 * Format dependency path as human-readable string
 */
export function formatDependencyPath(path: DependencyPathStep[]): string {
  return path
    .map((step, index) => {
      if (index === path.length - 1) {
        return step.assetName;
      }
      return `${step.assetName} --[${step.relationshipType}]-->`;
    })
    .join(' ');
}

/**
 * Calculate cascade probability
 */
export function calculateCascadeProbability(
  affectedAssets: AffectedAsset[],
  totalAssets: number
): number {
  if (totalAssets === 0) return 0;
  
  const affectedRatio = affectedAssets.length / totalAssets;
  const criticalAffected = affectedAssets.filter(a => a.impactLevel === 'critical').length;
  
  // Higher probability if many assets or critical assets affected
  const baseProb = Math.min(affectedRatio * 100, 80);
  const criticalBonus = (criticalAffected / affectedAssets.length) * 20;
  
  return Math.min(baseProb + criticalBonus, 95);
}

/**
 * Generate mitigation suggestions based on blast radius
 */
export function generateMitigationSuggestions(blastRadius: BlastRadius): string[] {
  const suggestions: string[] = [];
  
  const { byType, bySeverity, affectedBranches } = blastRadius;
  
  if (byType.camera && byType.camera > 10) {
    suggestions.push('Consider deploying backup network infrastructure for camera connectivity');
    suggestions.push('Review camera placement to minimize single-point-of-failure dependencies');
  }
  
  if (byType.nvr || byType.dvr) {
    suggestions.push('Implement redundant recording systems for critical cameras');
    suggestions.push('Ensure cloud backup for critical footage');
  }
  
  if (byType.storage) {
    suggestions.push('Deploy redundant storage arrays with automatic failover');
    suggestions.push('Implement regular backup procedures to off-site storage');
  }
  
  if (byType.switch || byType.gateway) {
    suggestions.push('Deploy redundant network switches with automatic failover');
    suggestions.push('Configure VLAN redundancy and link aggregation');
  }
  
  if (bySeverity.critical > 5) {
    suggestions.push('Prioritize redundancy for critical infrastructure components');
    suggestions.push('Implement real-time monitoring and alerting for critical assets');
  }
  
  if (affectedBranches.length > 1) {
    suggestions.push('Review inter-branch dependencies and consider isolation');
    suggestions.push('Implement regional failover capabilities');
  }
  
  return suggestions;
}
