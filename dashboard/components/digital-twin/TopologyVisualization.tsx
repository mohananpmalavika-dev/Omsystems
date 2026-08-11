"use client";

/**
 * Topology Visualization Component
 * 
 * Interactive graph visualization of surveillance infrastructure using react-flow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel,
  NodeTypes,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { TopologyNode } from './TopologyNode';
import { TopologyEdge } from './TopologyEdge';

interface TopologyData {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    status: string;
    healthScore: number;
    securityScore: number;
    metadata?: any;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    criticality: string;
  }>;
  totalAssets: number;
  healthySummary: {
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
  };
}

interface TopologyVisualizationProps {
  rootId?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  highlightedNodes?: string[];
  className?: string;
}

const nodeTypes: NodeTypes = {
  default: TopologyNode,
} as unknown as NodeTypes;

export function TopologyVisualization({
  rootId,
  onNodeClick,
  onNodeDoubleClick,
  highlightedNodes = [],
  className = '',
}: TopologyVisualizationProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topology, setTopology] = useState<TopologyData | null>(null);

  // Fetch topology data
  const fetchTopology = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = rootId
        ? `/api/digital-twin/topology?rootId=${rootId}`
        : '/api/digital-twin/topology';

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch topology');
      }

      const data: TopologyData = await response.json();
      setTopology(data);

      // Convert to react-flow format
      const flowNodes: Node[] = data.nodes.map((node, index) => ({
        id: node.id,
        type: 'default',
        position: calculateNodePosition(node, index, data.nodes.length),
        data: {
          label: node.label,
          type: node.type,
          status: node.status,
          healthScore: node.healthScore,
          securityScore: node.securityScore,
          metadata: node.metadata,
          isHighlighted: highlightedNodes.includes(node.id),
        },
      }));

      const flowEdges: Edge[] = data.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: edge.criticality === 'critical',
        label: edge.type.replace(/_/g, ' '),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getCriticalityColor(edge.criticality),
        },
        style: {
          stroke: getCriticalityColor(edge.criticality),
          strokeWidth: edge.criticality === 'critical' ? 3 : 2,
        },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [rootId, highlightedNodes, setNodes, setEdges]);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // Calculate node position using force-directed layout simulation
  const calculateNodePosition = (
    node: any,
    index: number,
    total: number
  ): { x: number; y: number } => {
    const typeLayering: Record<string, number> = {
      enterprise: 0,
      region: 1,
      branch: 2,
      network: 3,
      gateway: 3,
      switch: 4,
      nvr: 4,
      dvr: 4,
      recorder: 4,
      storage: 5,
      camera: 6,
    };

    const layer = typeLayering[node.type] || 3;
    const nodesInLayer = Math.ceil(total / 7); // Approximate nodes per layer
    const positionInLayer = index % nodesInLayer;

    return {
      x: 150 + positionInLayer * 250,
      y: 100 + layer * 150,
    };
  };

  const getCriticalityColor = (criticality: string): string => {
    switch (criticality) {
      case 'critical':
        return '#dc2626'; // red-600
      case 'high':
        return '#ea580c'; // orange-600
      case 'medium':
        return '#ca8a04'; // yellow-600
      case 'low':
        return '#16a34a'; // green-600
      default:
        return '#6b7280'; // gray-500
    }
  };

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node.id);
      }
    },
    [onNodeDoubleClick]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-gray-50 rounded-lg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading topology...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-red-50 rounded-lg">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <button
            onClick={fetchTopology}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Statistics Panel */}
      {topology && (
        <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Infrastructure Summary
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Assets:</span>
              <span className="font-semibold">{topology.totalAssets}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-600">● Healthy:</span>
              <span className="font-semibold">{topology.healthySummary.healthy}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-yellow-600">● Warning:</span>
              <span className="font-semibold">{topology.healthySummary.warning}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-red-600">● Critical:</span>
              <span className="font-semibold">{topology.healthySummary.critical}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">● Offline:</span>
              <span className="font-semibold">{topology.healthySummary.offline}</span>
            </div>
          </div>
          <button
            onClick={fetchTopology}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      )}

      {/* React Flow Canvas */}
      <div style={{ width: '100%', height: '600px' }} className="bg-gray-50 rounded-lg border border-gray-200">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          attributionPosition="bottom-left"
          minZoom={0.1}
          maxZoom={2}
        >
          <Background color="#e5e7eb" gap={16} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const status = node.data?.status;
              switch (status) {
                case 'healthy':
                  return '#10b981';
                case 'warning':
                  return '#f59e0b';
                case 'critical':
                  return '#ef4444';
                case 'offline':
                  return '#6b7280';
                default:
                  return '#9ca3af';
              }
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            position="bottom-right"
          />

          {/* Legend Panel */}
          <Panel position="bottom-left" className="bg-white rounded-lg shadow-lg p-3 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">
              Status Legend
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Healthy</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Critical</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span>Offline</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
