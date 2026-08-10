/**
 * Digital Twin Service
 * 
 * Core service for managing the digital twin of surveillance infrastructure.
 * Provides topology queries, dependency analysis, and blast radius calculations.
 */

import { Pool } from 'pg';
import { AssetRepository, RelationshipRepository, HistoryRepository } from '../repositories';
import { runAllCollectors } from '../collectors';
import {
  DigitalTwinAsset,
  TwinRelationship,
  TopologyGraph,
  TopologyNode,
  TopologyEdge,
  AssetDependencies,
  BlastRadius,
  AffectedAsset,
  DependencyPathStep,
  FailureSimulation,
  FailureSimulationResult,
  createTopologyNode,
  createTopologyEdge,
  createImpactSummary,
  generateMitigationSuggestions,
  calculateImpactLevel,
  TwinStateSnapshot,
  TwinEvent
} from '../models';

export class DigitalTwinService {
  private assetRepo: AssetRepository;
  private relationshipRepo: RelationshipRepository;
  private historyRepo: HistoryRepository;

  constructor(private readonly pool: Pool) {
    this.assetRepo = new AssetRepository(pool);
    this.relationshipRepo = new RelationshipRepository(pool);
    this.historyRepo = new HistoryRepository(pool);
  }

  /**
   * Get the enterprise root asset
   */
  async getEnterprise(): Promise<DigitalTwinAsset | null> {
    const assets = await this.assetRepo.findByType('enterprise');
    return assets[0] || null;
  }

  /**
   * Get asset by ID
   */
  async getAsset(id: string): Promise<DigitalTwinAsset | null> {
    return this.assetRepo.findById(id);
  }

  /**
   * Get children of an asset
   */
  async getChildren(id: string): Promise<DigitalTwinAsset[]> {
    return this.assetRepo.findChildren(id);
  }

  /**
   * Get all relationships for an asset
   */
  async getRelationships(id: string): Promise<TwinRelationship[]> {
    return this.relationshipRepo.findByAsset(id);
  }

  /**
   * Get dependencies (assets this asset depends on)
   */
  async getDependencies(id: string): Promise<DigitalTwinAsset[]> {
    const relationships = await this.relationshipRepo.findDependencies(id);
    const assetIds = relationships.map(r => r.targetId);
    
    if (assetIds.length === 0) {
      return [];
    }
    
    return this.assetRepo.findByIds(assetIds);
  }

  /**
   * Get dependents (assets that depend on this asset)
   */
  async getDependents(id: string): Promise<DigitalTwinAsset[]> {
    const relationships = await this.relationshipRepo.findDependents(id);
    const assetIds = relationships.map(r => r.sourceId);
    
    if (assetIds.length === 0) {
      return [];
    }
    
    return this.assetRepo.findByIds(assetIds);
  }

  /**
   * Get complete dependency information for an asset
   */
  async getAssetDependencies(id: string): Promise<AssetDependencies | null> {
    const asset = await this.assetRepo.findById(id);
    if (!asset) {
      return null;
    }

    // Get direct dependencies
    const directDepRels = await this.relationshipRepo.findDependencies(id);
    const directDepAssets = await this.assetRepo.findByIds(
      directDepRels.map(r => r.targetId)
    );

    const directDependencies = directDepRels.map(rel => {
      const asset = directDepAssets.find(a => a.id === rel.targetId);
      return {
        assetId: rel.targetId,
        assetName: asset?.name || 'Unknown',
        relationshipType: rel.type,
        criticality: rel.criticality
      };
    });

    // Get direct dependents
    const directDeptRels = await this.relationshipRepo.findDependents(id);
    const directDeptAssets = await this.assetRepo.findByIds(
      directDeptRels.map(r => r.sourceId)
    );

    const directDependents = directDeptRels.map(rel => {
      const asset = directDeptAssets.find(a => a.id === rel.sourceId);
      return {
        assetId: rel.sourceId,
        assetName: asset?.name || 'Unknown',
        relationshipType: rel.type,
        criticality: rel.criticality
      };
    });

    // Get all transitive dependencies
    const allDepRels = await this.relationshipRepo.findAllDependencies(id);
    const allDependencies = [...new Set(allDepRels.map(r => r.relationship.targetId))];

    // Get all transitive dependents
    const allDeptRels = await this.relationshipRepo.findAllDependents(id);
    const allDependents = [...new Set(allDeptRels.map(r => r.relationship.sourceId))];

    return {
      assetId: id,
      assetName: asset.name,
      directDependencies,
      directDependents,
      allDependencies,
      allDependents
    };
  }

  /**
   * Calculate blast radius for an asset failure
   */
  async calculateBlastRadius(assetId: string): Promise<BlastRadius> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // Get all transitive dependents (assets that would be affected)
    const dependentRels = await this.relationshipRepo.findAllDependents(assetId);
    
    const affectedAssets: AffectedAsset[] = [];
    const affectedBranches = new Set<string>();
    const affectedRegions = new Set<string>();
    const byType: Record<string, number> = {};
    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    // Build affected assets with dependency paths
    for (const depRel of dependentRels) {
      const depAsset = await this.assetRepo.findById(depRel.relationship.sourceId);
      if (!depAsset) continue;

      // Build dependency path
      const path = await this.buildDependencyPath(depAsset.id, assetId);

      const impactLevel = this.determineImpactLevel(depAsset, depRel.depth);
      
      affectedAssets.push({
        assetId: depAsset.id,
        assetName: depAsset.name,
        assetType: depAsset.type,
        dependencyDepth: depRel.depth,
        dependencyPath: path,
        impact: this.describeImpact(depAsset, asset),
        impactLevel,
        reason: this.explainDependency(depAsset, asset, path)
      });

      // Aggregate statistics
      byType[depAsset.type] = (byType[depAsset.type] || 0) + 1;
      bySeverity[impactLevel]++;

      // Track affected branches/regions
      if (depAsset.parentId?.startsWith('branch_')) {
        affectedBranches.add(depAsset.parentId);
      }
      if (depAsset.parentId?.startsWith('region_')) {
        affectedRegions.add(depAsset.parentId);
      }
    }

    // Identify critical services affected
    const criticalServices = this.identifyCriticalServices(affectedAssets);

    // Calculate business impact
    const businessImpact = this.calculateBusinessImpact(asset, affectedAssets);

    const blastRadius: BlastRadius = {
      sourceAssetId: assetId,
      sourceAssetName: asset.name,
      sourceAssetType: asset.type,
      totalAffected: affectedAssets.length,
      byType,
      bySeverity,
      affectedBranches: Array.from(affectedBranches),
      affectedRegions: Array.from(affectedRegions),
      criticalServices,
      affectedAssets,
      businessImpact,
      calculatedAt: new Date()
    };

    return blastRadius;
  }

  /**
   * Build dependency path from source to target
   */
  private async buildDependencyPath(
    sourceId: string,
    targetId: string
  ): Promise<DependencyPathStep[]> {
    const path: DependencyPathStep[] = [];
    let currentId = sourceId;
    const visited = new Set<string>();

    while (currentId !== targetId && visited.size < 10) {
      visited.add(currentId);
      
      const deps = await this.relationshipRepo.findDependencies(currentId);
      const nextRel = deps.find(r => !visited.has(r.targetId));
      
      if (!nextRel) break;

      const asset = await this.assetRepo.findById(currentId);
      if (asset) {
        path.push({
          assetId: currentId,
          assetName: asset.name,
          assetType: asset.type,
          relationshipType: nextRel.type
        });
      }

      currentId = nextRel.targetId;
    }

    return path;
  }

  /**
   * Determine impact level for an affected asset
   */
  private determineImpactLevel(
    asset: DigitalTwinAsset,
    depth: number
  ): 'critical' | 'high' | 'medium' | 'low' {
    // Asset's own criticality
    if (asset.criticality === 'critical' || depth === 1) {
      return 'critical';
    }
    
    if (asset.criticality === 'high' || depth === 2) {
      return 'high';
    }
    
    if (depth === 3) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Describe the impact on a dependent asset
   */
  private describeImpact(dependent: DigitalTwinAsset, failed: DigitalTwinAsset): string {
    const depType = dependent.type;
    const failType = failed.type;

    if (depType === 'camera') {
      if (failType === 'switch' || failType === 'gateway') {
        return 'Camera offline - network connectivity lost';
      }
      if (failType === 'nvr' || failType === 'dvr') {
        return 'Recording unavailable - footage not being captured';
      }
      if (failType === 'storage') {
        return 'Recording storage unavailable';
      }
    }

    if (depType === 'nvr' || depType === 'dvr') {
      if (failType === 'storage') {
        return 'Recording storage lost - cannot store footage';
      }
      if (failType === 'switch' || failType === 'gateway') {
        return 'Network connectivity lost';
      }
    }

    return `Depends on ${failed.name}`;
  }

  /**
   * Explain why an asset depends on the failed asset
   */
  private explainDependency(
    dependent: DigitalTwinAsset,
    failed: DigitalTwinAsset,
    path: DependencyPathStep[]
  ): string {
    if (path.length === 0) {
      return `${dependent.name} directly depends on ${failed.name}`;
    }

    const pathStr = path
      .map(step => `${step.assetName} (${step.relationshipType})`)
      .join(' → ');
    
    return `${dependent.name} → ${pathStr} → ${failed.name}`;
  }

  /**
   * Identify critical services affected
   */
  private identifyCriticalServices(affected: AffectedAsset[]): Array<{
    service: string;
    impact: string;
    affectedAssets: number;
  }> {
    const services: Map<string, Set<string>> = new Map();

    for (const asset of affected) {
      if (asset.assetType === 'camera') {
        const service = 'Camera Surveillance';
        if (!services.has(service)) {
          services.set(service, new Set());
        }
        services.get(service)!.add(asset.assetId);
      }

      if (asset.assetType === 'nvr' || asset.assetType === 'dvr') {
        const service = 'Video Recording';
        if (!services.has(service)) {
          services.set(service, new Set());
        }
        services.get(service)!.add(asset.assetId);
      }

      if (asset.assetType === 'storage') {
        const service = 'Storage System';
        if (!services.has(service)) {
          services.set(service, new Set());
        }
        services.get(service)!.add(asset.assetId);
      }
    }

    return Array.from(services.entries()).map(([service, assets]) => ({
      service,
      impact: `${assets.size} ${service.toLowerCase()} components affected`,
      affectedAssets: assets.size
    }));
  }

  /**
   * Calculate business impact
   */
  private calculateBusinessImpact(
    failed: DigitalTwinAsset,
    affected: AffectedAsset[]
  ): BlastRadius['businessImpact'] {
    const cameras = affected.filter(a => a.assetType === 'camera').length;
    const recorders = affected.filter(a => ['nvr', 'dvr'].includes(a.assetType)).length;

    let coverageLoss = 'Unknown';
    if (cameras > 0) {
      coverageLoss = `${cameras} camera${cameras > 1 ? 's' : ''} offline`;
    }

    const complianceRisk = affected.some(a => a.impactLevel === 'critical');

    let operationalImpact = 'Minor';
    if (cameras > 20 || recorders > 2) {
      operationalImpact = 'Severe';
    } else if (cameras > 10 || recorders > 1) {
      operationalImpact = 'Major';
    } else if (cameras > 5) {
      operationalImpact = 'Moderate';
    }

    const estimatedDowntime = this.estimateDowntime(failed);

    return {
      coverageLoss,
      complianceRisk,
      operationalImpact,
      estimatedDowntime
    };
  }

  /**
   * Estimate downtime for asset failure
   */
  private estimateDowntime(asset: DigitalTwinAsset): string {
    switch (asset.type) {
      case 'camera':
        return '1-2 hours';
      case 'switch':
        return '2-4 hours';
      case 'gateway':
        return '4-8 hours';
      case 'nvr':
      case 'dvr':
        return '4-12 hours';
      case 'storage':
        return '12-24 hours';
      default:
        return '2-6 hours';
    }
  }

  /**
   * Simulate a failure scenario
   */
  async simulateFailure(simulation: FailureSimulation): Promise<FailureSimulationResult> {
    const asset = await this.assetRepo.findById(simulation.assetId);
    if (!asset) {
      throw new Error(`Asset ${simulation.assetId} not found`);
    }

    // Calculate blast radius
    const blastRadius = await this.calculateBlastRadius(simulation.assetId);

    // Predict state changes
    const predictedStateChanges = blastRadius.affectedAssets.map(affected => ({
      assetId: affected.assetId,
      assetName: affected.assetName,
      currentStatus: 'healthy' as const,
      predictedStatus: simulation.failureType,
      reason: affected.impact
    }));

    // Generate mitigation suggestions
    const mitigationSuggestions = generateMitigationSuggestions(blastRadius);

    // Estimate recovery time
    const estimatedRecoveryTime = blastRadius.businessImpact?.estimatedDowntime || 'Unknown';

    return {
      simulation,
      blastRadius,
      predictedStateChanges,
      mitigationSuggestions,
      estimatedRecoveryTime
    };
  }

  /**
   * Get topology graph for visualization
   */
  async getTopology(rootId?: string): Promise<TopologyGraph> {
    let assets: DigitalTwinAsset[];
    
    if (rootId) {
      // Get root and all descendants
      const root = await this.assetRepo.findById(rootId);
      if (!root) {
        throw new Error(`Asset ${rootId} not found`);
      }
      
      const descendants = await this.assetRepo.findDescendants(rootId);
      assets = [root, ...descendants];
    } else {
      // Get all assets (might be too large for production)
      const enterprise = await this.getEnterprise();
      if (enterprise) {
        assets = await this.assetRepo.findDescendants(enterprise.id);
        assets.unshift(enterprise);
      } else {
        assets = [];
      }
    }

    // Get all relationships between these assets
    const assetIds = assets.map(a => a.id);
    const allRelationships = await Promise.all(
      assetIds.map(id => this.relationshipRepo.findBySource(id))
    );
    const relationships = allRelationships.flat();

    // Convert to topology graph
    const nodes: TopologyNode[] = assets.map(asset =>
      createTopologyNode(
        asset.id,
        asset.type,
        asset.name,
        asset.status,
        asset.health.score,
        asset.security.score,
        {
          ipAddress: (asset.metadata as any).ipAddress,
          location: asset.location,
          uptime: asset.health.metrics?.uptime,
          issues: asset.health.issues.length
        }
      )
    );

    const edges: TopologyEdge[] = relationships
      .filter(rel => assetIds.includes(rel.targetId)) // Only edges within the graph
      .map(rel =>
        createTopologyEdge(rel.sourceId, rel.targetId, rel.type, rel.criticality, rel.metadata)
      );

    // Calculate health summary
    const healthySummary = {
      healthy: assets.filter(a => a.status === 'healthy').length,
      warning: assets.filter(a => a.status === 'warning').length,
      critical: assets.filter(a => a.status === 'critical').length,
      offline: assets.filter(a => a.status === 'offline').length
    };

    return {
      nodes,
      edges,
      rootId,
      totalAssets: assets.length,
      healthySummary
    };
  }

  /**
   * Refresh digital twin from infrastructure
   */
  async refresh(): Promise<{
    assetsCreated: number;
    assetsUpdated: number;
    relationshipsCreated: number;
    errors: number;
  }> {
    console.log('[DigitalTwin] Starting refresh...');

    // Run collectors
    const collectorResults = await runAllCollectors(this.pool);

    let assetsCreated = 0;
    let assetsUpdated = 0;
    let relationshipsCreated = 0;

    // Process collected assets
    for (const [collectorName, result] of collectorResults.results) {
      for (const asset of result.assets) {
        const existing = await this.assetRepo.findById(asset.id);
        
        if (existing) {
          await this.assetRepo.update(asset.id, asset);
          assetsUpdated++;
        } else {
          await this.assetRepo.create(asset);
          assetsCreated++;
        }
      }

      for (const relationship of result.relationships) {
        try {
          await this.relationshipRepo.create(relationship);
          relationshipsCreated++;
        } catch (error) {
          // Ignore duplicate relationship errors
        }
      }
    }

    console.log(
      `[DigitalTwin] Refresh complete: ` +
      `${assetsCreated} created, ${assetsUpdated} updated, ` +
      `${relationshipsCreated} relationships, ${collectorResults.totalErrors} errors`
    );

    return {
      assetsCreated,
      assetsUpdated,
      relationshipsCreated,
      errors: collectorResults.totalErrors
    };
  }

  /**
   * Get asset history
   */
  async getAssetHistory(
    assetId: string,
    from: Date,
    to: Date
  ): Promise<TwinStateSnapshot[]> {
    return this.historyRepo.getSnapshotHistory(assetId, from, to);
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit: number = 100): Promise<TwinEvent[]> {
    return this.historyRepo.getRecentEvents(limit);
  }
}
