"use client";

/**
 * Custom Topology Node Component
 * 
 * Renders individual nodes in the topology graph with status indicators.
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Camera,
  Server,
  HardDrive,
  Network,
  Building2,
  Globe,
  Router,
} from 'lucide-react';

const getIconForType = (type: string) => {
  const iconProps = { className: 'h-4 w-4', strokeWidth: 2 };
  
  switch (type) {
    case 'camera':
      return <Camera {...iconProps} />;
    case 'nvr':
    case 'dvr':
    case 'recorder':
      return <Server {...iconProps} />;
    case 'storage':
      return <HardDrive {...iconProps} />;
    case 'switch':
    case 'gateway':
      return <Router {...iconProps} />;
    case 'network':
      return <Network {...iconProps} />;
    case 'branch':
      return <Building2 {...iconProps} />;
    case 'region':
    case 'enterprise':
      return <Globe {...iconProps} />;
    default:
      return <Network {...iconProps} />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'healthy':
      return {
        bg: 'bg-green-50',
        border: 'border-green-500',
        text: 'text-green-700',
        dot: 'bg-green-500',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-500',
        text: 'text-yellow-700',
        dot: 'bg-yellow-500',
      };
    case 'critical':
      return {
        bg: 'bg-red-50',
        border: 'border-red-500',
        text: 'text-red-700',
        dot: 'bg-red-500',
      };
    case 'offline':
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-400',
        text: 'text-gray-600',
        dot: 'bg-gray-400',
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-300',
        text: 'text-gray-600',
        dot: 'bg-gray-300',
      };
  }
};

export const TopologyNode = memo(({ data, selected }: NodeProps) => {
  const colors = getStatusColor(data.status);
  const icon = getIconForType(data.type);
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border-2 shadow-md
        transition-all duration-200
        ${colors.bg} ${colors.border}
        ${selected ? 'ring-4 ring-blue-300' : ''}
        ${isHighlighted ? 'ring-4 ring-orange-400 shadow-xl' : ''}
        hover:shadow-lg
        min-w-[180px]
      `}
    >
      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-2 !h-2"
      />

      {/* Status Indicator */}
      <div className="absolute -top-1 -right-1">
        <div className={`w-3 h-3 rounded-full ${colors.dot} animate-pulse`}></div>
      </div>

      {/* Node Content */}
      <div className="flex items-start gap-3">
        <div className={`${colors.text} mt-0.5`}>{icon}</div>
        
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">
            {data.label}
          </div>
          <div className="text-xs text-gray-500 capitalize mt-0.5">
            {data.type}
          </div>
          
          {/* Health and Security Scores */}
          <div className="flex gap-3 mt-2 text-xs">
            <div>
              <span className="text-gray-500">Health:</span>
              <span className={`ml-1 font-semibold ${
                data.healthScore >= 80 ? 'text-green-600' :
                data.healthScore >= 60 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {data.healthScore}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Security:</span>
              <span className={`ml-1 font-semibold ${
                data.securityScore >= 80 ? 'text-green-600' :
                data.securityScore >= 60 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {data.securityScore}
              </span>
            </div>
          </div>

          {/* Metadata (IP Address if available) */}
          {data.metadata?.ipAddress && (
            <div className="text-xs text-gray-400 mt-1 font-mono">
              {data.metadata.ipAddress}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TopologyNode.displayName = 'TopologyNode';
