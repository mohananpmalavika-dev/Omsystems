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
  Search,
  Layers,
  Globe,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { organizationApi } from "@/lib/api-client";

export interface OrgNode {
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
  onAddChild?: (parentNode: OrgNode, defaultType?: string) => void;
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
  const [searchTerm, setSearchTerm] = useState("");
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
      setTree(response.data || []);
      
      // Auto-expand all top-level and first-level nodes
      const initialExpanded = new Set<string>();
      const addIds = (nodes: OrgNode[], depth = 0) => {
        for (const n of nodes) {
          if (depth < 3) initialExpanded.add(n.id);
          if (n.children) addIds(n.children, depth + 1);
        }
      };
      addIds(response.data || []);
      setExpandedNodes(initialExpanded);
    } catch (err: any) {
      console.error("Failed to load organization tree:", err);
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

  const expandAll = () => {
    const all = new Set<string>();
    const collect = (nodes: OrgNode[]) => {
      for (const n of nodes) {
        all.add(n.id);
        if (n.children) collect(n.children);
      }
    };
    collect(tree);
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleSelectNode = (node: OrgNode) => {
    setSelectedNodeId(node.id);
    onSelectNode?.(node);
  };

  const getNodeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case "company":
        return { label: "Company", bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" };
      case "headquarters":
        return { label: "Headquarters", bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" };
      case "zone":
        return { label: "Zone", bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" };
      case "region":
        return { label: "Region", bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" };
      case "area":
        return { label: "Area", bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" };
      case "branch":
        return { label: "Branch", bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" };
      default:
        return { label: type, bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "company":
        return <Building2 size={16} style={{ color: "#2563eb" }} />;
      case "headquarters":
        return <Building2 size={16} style={{ color: "#9333ea" }} />;
      case "zone":
        return <Globe size={16} style={{ color: "#16a34a" }} />;
      case "region":
        return <MapPin size={16} style={{ color: "#0d9488" }} />;
      case "area":
        return <Layers size={16} style={{ color: "#0891b2" }} />;
      case "branch":
        return <Building2 size={16} style={{ color: "#ea580c" }} />;
      default:
        return <Building2 size={16} style={{ color: "#64748b" }} />;
    }
  };

  const rootNode = tree[0];

  const renderNode = (node: OrgNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const badge = getNodeBadge(node.type);
    const isBranch = node.type.toLowerCase() === "branch";

    // Search filter match
    const matchesSearch =
      !searchTerm ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.code && node.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      node.type.toLowerCase().includes(searchTerm.toLowerCase());

    return (
      <div key={node.id} className="org-tree-node" style={{ marginBottom: "0.375rem" }}>
        <div
          className={`org-node-item ${isSelected ? "selected" : ""} ${!node.isActive ? "inactive" : ""}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.625rem 0.875rem",
            paddingLeft: `${level * 24 + 12}px`,
            borderRadius: "0.5rem",
            background: isSelected ? "#eff6ff" : "#ffffff",
            border: isSelected ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            transition: "all 0.15s ease",
          }}
        >
          {/* Left: Expand + Icon + Name + Meta */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
            <button
              className="expand-button"
              onClick={() => toggleNode(node.id)}
              disabled={!hasChildren}
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: hasChildren ? "#f1f5f9" : "transparent",
                borderRadius: "0.25rem",
                cursor: hasChildren ? "pointer" : "default",
                color: "#64748b",
              }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span style={{ width: 14 }} />
              )}
            </button>

            <div
              onClick={() => handleSelectNode(node)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                cursor: "pointer",
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "0.375rem",
                  background: badge.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {getNodeIcon(node.type)}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#0f172a" }}>
                  {node.name}
                </span>

                {node.code && (
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>
                    {node.code}
                  </span>
                )}

                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    background: badge.bg,
                    color: badge.text,
                    border: `1px solid ${badge.border}`,
                  }}
                >
                  {badge.label}
                </span>

                {node.cameraCount !== undefined && node.cameraCount > 0 && (
                  <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 500 }}>
                    📹 {node.cameraCount} cameras
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
            {!isBranch && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild?.(node, "branch");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.25rem 0.625rem",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    borderRadius: "0.375rem",
                    border: "1px solid #fed7aa",
                    background: "#fff7ed",
                    color: "#c2410c",
                    cursor: "pointer",
                  }}
                  title="Add a Branch under this node"
                >
                  <Plus size={12} /> Add Branch
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const defaultChild =
                      node.type === "company" || node.type === "headquarters"
                        ? "zone"
                        : node.type === "zone"
                        ? "region"
                        : "area";
                    onAddChild?.(node, defaultChild);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.25rem 0.625rem",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    borderRadius: "0.375rem",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                  title="Add Sub-Node (Zone / Region / Area)"
                >
                  <Plus size={12} /> Add Sub-Node
                </button>
              </>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditNode?.(node);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.375rem",
                fontSize: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#64748b",
                cursor: "pointer",
              }}
              title="Edit node"
            >
              <Edit size={13} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNode?.(node);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.375rem",
                fontSize: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #fee2e2",
                background: "#ffffff",
                color: "#ef4444",
                cursor: "pointer",
              }}
              title="Delete node"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="org-node-children" style={{ marginLeft: "0.5rem", borderLeft: "2px dashed #e2e8f0", paddingLeft: "0.5rem", marginTop: "0.25rem" }}>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem auto" }} />
        <p style={{ fontWeight: 600 }}>Loading organizational hierarchy...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem" }}>
        <p style={{ color: "#991b1b", fontWeight: 600, marginBottom: "1rem" }}>{error}</p>
        <button onClick={loadTree} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  if (!tree || tree.length === 0) {
    return (
      <div style={{ padding: "3rem 1.5rem", textAlign: "center", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "0.75rem" }}>
        <Building2 size={48} style={{ color: "#94a3b8", margin: "0 auto 1rem auto" }} />
        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.5rem" }}>
          No Organization Nodes Found
        </h3>
        <p style={{ color: "#64748b", maxWidth: 480, margin: "0 auto 1.5rem auto", fontSize: "0.875rem" }}>
          Your company root node is ready. Click below to add your first zone, region, or branch.
        </p>
      </div>
    );
  }

  return (
    <div className="org-tree-wrapper">
      {/* Action Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          padding: "0.875rem 1rem",
          background: "#ffffff",
          borderRadius: "0.5rem",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", minWidth: 240 }}>
          <Search size={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter zones, regions, branches..."
            style={{
              width: "100%",
              padding: "0.4375rem 0.75rem 0.4375rem 2.25rem",
              fontSize: "0.8125rem",
              borderRadius: "0.375rem",
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              background: "#ffffff",
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={expandAll}
            style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, borderRadius: "0.375rem", border: "1px solid #e2e8f0", background: "#ffffff", color: "#475569", cursor: "pointer" }}
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, borderRadius: "0.375rem", border: "1px solid #e2e8f0", background: "#ffffff", color: "#475569", cursor: "pointer" }}
          >
            Collapse All
          </button>

          {rootNode && (
            <>
              <button
                type="button"
                onClick={() => onAddChild?.(rootNode, "branch")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.4375rem 0.875rem",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  borderRadius: "0.375rem",
                  border: "none",
                  background: "#ea580c",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> Add Branch
              </button>

              <button
                type="button"
                onClick={() => onAddChild?.(rootNode, "zone")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.4375rem 0.875rem",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  borderRadius: "0.375rem",
                  border: "1px solid #cbd5e1",
                  background: "#2563eb",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> Add Zone / Region
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tree Nodes List */}
      <div className="org-tree-list">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}
