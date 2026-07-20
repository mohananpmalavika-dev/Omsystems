"use client";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  Edit,
  MapPin,
  MoreVertical,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState, useEffect } from "react";
import { organizationApi } from "@/lib/api-client";

interface OrgNode {
  id: string;
  name: string;
  code?: string;
  type: string;
  isActive: boolean;
  children?: OrgNode[];
  cameraCount?: number;
  userCount?: number;
  address?: any;
}

interface OrganizationTreeProps {
  onSelectNode?: (node: OrgNode) => void;
  onEditNode?: (node: OrgNode) => void;
  onDeleteNode?: (node: OrgNode) => void;
  onAddChild?: (parentNode: OrgNode) => void;
}

export function OrganizationTree({
  onSelectNode,
  onEditNode,
  onDeleteNode,
  onAddChild,
}: OrganizationTreeProps) {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTree();
  }, []);

  const loadTree = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await organizationApi.getTree();
      setTree(response.data);
    } catch (err: any) {
      setError(err.message || "Failed to load organization tree");
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleSelectNode = (node: OrgNode) => {
    setSelectedNodeId(node.id);
    onSelectNode?.(node);
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "company":
        return <Building2 size={16} className="text-blue-600" />;
      case "headquarters":
        return <Building2 size={16} className="text-purple-600" />;
      case "zone":
        return <MapPin size={16} className="text-green-600" />;
      case "region":
        return <MapPin size={16} className="text-teal-600" />;
      case "area":
        return <MapPin size={16} className="text-cyan-600" />;
      case "branch":
        return <Building2 size={16} className="text-orange-600" />;
      default:
        return <Building2 size={16} className="text-gray-600" />;
    }
  };

  const renderNode = (node: OrgNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;

    return (
      <div key={node.id} className="org-tree-node">
        <div
          className={`org-node-item ${isSelected ? "selected" : ""} ${
            !node.isActive ? "inactive" : ""
          }`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          <button
            className="expand-button"
            onClick={() => toggleNode(node.id)}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <span className="no-children" />
            )}
          </button>

          <div
            className="node-content"
            onClick={() => handleSelectNode(node)}
          >
            <div className="node-icon">{getNodeIcon(node.type)}</div>
            <div className="node-info">
              <div className="node-name">
                {node.name}
                {node.code && (
                  <span className="node-code">({node.code})</span>
                )}
              </div>
              <div className="node-meta">
                <span className="node-type">{node.type}</span>
                {node.cameraCount !== undefined && (
                  <span className="node-stat">
                    {node.cameraCount} cameras
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="node-actions">
            <button
              className="icon-button"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild?.(node);
              }}
              title="Add child node"
            >
              <Plus size={14} />
            </button>
            <button
              className="icon-button"
              onClick={(e) => {
                e.stopPropagation();
                onEditNode?.(node);
              }}
              title="Edit node"
            >
              <Edit size={14} />
            </button>
            <button
              className="icon-button text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNode?.(node);
              }}
              title="Delete node"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="org-node-children">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="org-tree-container">
        <div className="loading-spinner">Loading organization...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="org-tree-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadTree} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="org-tree-container">
      <div className="org-tree">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}
