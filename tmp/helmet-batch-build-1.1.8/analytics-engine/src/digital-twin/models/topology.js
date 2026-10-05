/**
 * Digital Twin Topology Models
 *
 * Graph structures for visualizing and analyzing infrastructure topology.
 */
/**
 * Helper to create topology node from asset data
 */
export function createTopologyNode(id, type, label, status, healthScore, securityScore, metadata) {
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
export function createTopologyEdge(source, target, type, criticality, metadata) {
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
export function calculateGraphStats(graph) {
    const totalNodes = graph.nodes.length;
    const totalEdges = graph.edges.length;
    const avgConnections = totalNodes > 0 ? totalEdges / totalNodes : 0;
    const criticalAssets = graph.nodes.filter(n => n.criticality === 'critical' || n.status === 'critical').length;
    const offlineAssets = graph.nodes.filter(n => n.status === 'offline').length;
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
export function groupNodesByType(nodes) {
    const groups = new Map();
    for (const node of nodes) {
        if (!groups.has(node.type)) {
            groups.set(node.type, []);
        }
        groups.get(node.type).push(node);
    }
    return groups;
}
/**
 * Find shortest path between two nodes
 */
export function findShortestPath(graph, sourceId, targetId) {
    const visited = new Set();
    const queue = [{ nodeId: sourceId, path: [sourceId], relationships: [] }];
    while (queue.length > 0) {
        const current = queue.shift();
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
        const connectedEdges = graph.edges.filter(e => e.source === current.nodeId || e.target === current.nodeId);
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
function formatDependencyPath(path, relationships, graph) {
    const parts = [];
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
