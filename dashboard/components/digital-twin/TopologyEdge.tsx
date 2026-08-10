"use client";

/**
 * Custom Topology Edge Component
 * 
 * Renders relationship edges with labels and criticality indicators.
 */

import React from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';

export function TopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {data?.label && (
        <text>
          <textPath
            href={`#${id}`}
            style={{ fontSize: '10px' }}
            startOffset="50%"
            textAnchor="middle"
            className="fill-gray-600"
          >
            {data.label}
          </textPath>
        </text>
      )}
    </>
  );
}
