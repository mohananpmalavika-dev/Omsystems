/**
 * Digital Twin Topology Models
 * 
 * Graph structures for visualizing and analyzing infrastructure topology.
 */

import { AssetStatus, AssetType } from './asset.js';
import { RelationshipType, RelationshipCriticality } from './relationship.js';

/**
 * Graph node representing an asset in the topology
 */
export interface TopologyNode {
  id: string;
  type: AssetType;
  label: string;
  status: AssetStatus;
  
  // Visual properties
  criticality?: 'critical' | 'high' | 'medium' | 'low';
  healthScore: number;
  securityScore: number;
  
  // Position hints for layout
  position?: {
    x: number;
    y: number;
  };
  
  // Metadata for tooltips
  metadata?: {
    ipAddress?: string;
    location?: string;
    uptime?: number;
    issues?: number;
    [key: string]: unknown;
  };
}

/**
 * Graph edge representing a relationship in the topology
 */
export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  criticality: RelationshipCriticality;
  
  // Visual properties
  label?: string;
  animated?: boolean;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Complete topology graph
 */
export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  
  // Graph metadata
  rootId?: string;
  totalAssets: number;
  healthySummary: {
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
  };
  
  // Layout hints
  layers?: {
    [layer: string]: string[];
  };
}

/**
 * Dependency path from source to target
 */
export interface DependencyPath {
  assetIds: string[];
  relationshipTypes: RelationshipType[];
  totalLength: number;
  criticality: RelationshipCriticality;
  
  // Human-readable description
  description: string;
}

/**
 * Asset with its dependencies
 */
export interface AssetDependencies {
  assetId: string;
  assetName: string;
  
  // Direct dependencies
  directDependencies: Array<{
    assetId: string;
    assetName: string;
    relationshipType: RelationshipType;
    criticality: RelationshipCriticality;
  }>;
  
  // Direct dependents (things that depend on this asset)
  directDependents: Array<{
    assetId: string;
    assetName: string;
    relationshipType: RelationshipType;
    criticality: RelationshipCriticality;
  }>;
  
  // All transitive dependencies
  allDependencies: string[];
  
  // All transitive dependents
  allDependents: string[];
}

/**
 * Topology filter options
 */
export interface TopologyFilter {
  assetTypes?: AssetType[];
  status?: AssetStatus[];
  branchId?: string;
  minHealthScore?: number;
  maxDepth?: number;
  relationshipTypes?: RelationshipType[];
}

/**
 * Helper to create topology node from asset data
 */
export function createTopologyNode(
  id: string,
  type: AssetType,
  label: string,
  status: AssetStatus,
  healthScore: number,
  securityScore: number,
  metadata?: Record<string, unknown>
): TopologyNode {
  return {
    id,
    type,
    label,
    status,
    healthScore,
    securityScore,
    metadata
  };
}

/**
 * Helper to create topology edge
 */
export function createTopologyEdge(
  source: string,
  target: string,
  type: RelationshipType,
  criticality: RelationshipCriticality,
  metadata?: Record<string, unknown>
): TopologyEdge {
  return {
    id: `edge_${source}_${target}_${type}`,
    source,
    target,
    type,
    criticality,
    metadata
  };
}

/**
 * Calculate graph statistics
 */
export function calculateGraphStats(graph: TopologyGraph): {
  totalNodes: number;
  totalEdges: number;
  avgConnections: number;
  criticalAssets: number;
  offlineAssets: number;
} {
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;
  const avgConnections = totalNodes > 0 ? totalEdges / totalNodes : 0;
  
  const criticalAssets = graph.nodes.filter(
    n => n.criticality === 'critical' || n.status === 'critical'
  ).length;
  
  const offlineAssets = graph.nodes.filter(
    n => n.status === 'offline'
  ).length;
  
  return {
    totalNodes,
    totalEdges,
    avgConnections,
    criticalAssets,
    offlineAssets
  };
}

/**
 * Group nodes by type for layered visualization
 */
export function groupNodesByType(nodes: TopologyNode[]): Map<AssetType, TopologyNode[]> {
  const groups = new Map<AssetType, TopologyNode[]>();
  
  for (const node of nodes) {
    if (!groups.has(node.type)) {
      groups.set(node.type, []);
    }
    groups.get(node.type)!.push(node);
  }
  
  return groups;
}

/**
 * Find shortest path between two nodes
 */
export function findShortestPath(
  graph: TopologyGraph,
  sourceId: string,
  targetId: string
): DependencyPath | null {
  const visited = new Set<string>();
  const queue: Array<{
    nodeId: string;
    path: string[];
    relationships: RelationshipType[];
  }> = [{ nodeId: sourceId, path: [sourceId], relationships: [] }];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.nodeId === targetId) {
      return {
        assetIds: current.path,
        relationshipTypes: current.relationships,
        totalLength: current.path.length - 1,
        criticality: 'medium',
        description: formatDependencyPath(current.path, current.relationships, graph)
      };
    }
    
    if (visited.has(current.nodeId)) {
      continue;
    }
    
    visited.add(current.nodeId);
    
    // Find connected nodes
    const connectedEdges = graph.edges.filter(
      e => e.source === current.nodeId || e.target === current.nodeId
    );
    
    for (const edge of connectedEdges) {
      const nextNodeId = edge.source === current.nodeId ? edge.target : edge.source;
      
      if (!visited.has(nextNodeId)) {
        queue.push({
          nodeId: nextNodeId,
          path: [...current.path, nextNodeId],
          relationships: [...current.relationships, edge.type]
        });
      }
    }
  }
  
  return null;
}

/**
 * Format dependency path as human-readable description
 */
function formatDependencyPath(
  path: string[],
  relationships: RelationshipType[],
  graph: TopologyGraph
): string {
  const parts: string[] = [];
  
  for (let i = 0; i < path.length; i++) {
    const node = graph.nodes.find(n => n.id === path[i]);
    if (node) {
      parts.push(node.label);
    }
    
    if (i < relationships.length) {
      parts.push(relationships[i].replace(/_/g, ' '));
    }
  }
  
  return parts.join(' → ');
}
