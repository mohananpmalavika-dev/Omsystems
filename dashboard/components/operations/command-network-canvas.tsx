"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Building2, Camera, ChevronLeft, ChevronRight, Layers, MapPin, Network, Plus, ShieldAlert } from "lucide-react";
import { buildBranchHierarchy, type BranchHierarchyNode, type NetworkBranch, type OrganizationTreeNode } from "@/lib/branch-hierarchy";

const icons = { zone: Network, region: Layers, area: MapPin, branch: Building2 };
const positions = [
  { x: 20, y: 29 }, { x: 50, y: 13 }, { x: 80, y: 29 },
  { x: 80, y: 72 }, { x: 50, y: 87 }, { x: 20, y: 72 },
];

export function CommandNetworkCanvas({ branches, organizationTree, confirmed, onSelect }: {
  branches: NetworkBranch[];
  organizationTree: OrganizationTreeNode[];
  confirmed: boolean;
  onSelect: (branch: NetworkBranch) => void;
}) {
  const [layer, setLayer] = useState<"coverage" | "risk">("coverage");
  const [path, setPath] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const hierarchy = useMemo(() => buildBranchHierarchy(branches, organizationTree), [branches, organizationTree]);
  const ancestors: BranchHierarchyNode[] = [];
  let visible = hierarchy;
  for (const id of path) {
    const parent = visible.find((node) => node.id === id && node.type !== "branch");
    if (!parent) break;
    ancestors.push(parent);
    visible = parent.children;
  }
  const activePath = ancestors.map((node) => node.id);
  const current = ancestors.at(-1);
  const pageCount = Math.ceil(visible.length / positions.length);
  const activePage = Math.min(page, Math.max(0, pageCount - 1));
  const visibleNodes = visible.slice(activePage * positions.length, (activePage + 1) * positions.length);

  const navigate = (nextPath: string[]) => {
    setPath(nextPath);
    setPage(0);
  };

  const nodeDetail = (node: BranchHierarchyNode) => {
    if (layer === "risk") {
      return node.type === "branch"
        ? `${node.branch?.risk?.level || "Unknown"} risk`
        : `${node.atRiskCount} at risk · ${node.branchCount} ${node.branchCount === 1 ? "branch" : "branches"}`;
    }
    return node.type === "branch"
      ? `${node.workingCount}/${node.cameraCount} cameras working`
      : `${node.branchCount} ${node.branchCount === 1 ? "branch" : "branches"} · ${node.workingCount}/${node.cameraCount} cameras working`;
  };

  return <section className="atlas-network" aria-label="Branch network hierarchy">
    <div className="atlas-network-toolbar">
      <span><Network size={15} /> ESTATE HIERARCHY</span>
      <div className="atlas-layer-switch" aria-label="Network data layer">
        <button type="button" aria-pressed={layer === "coverage"} onClick={() => setLayer("coverage")}><Camera size={13} /> Coverage</button>
        <button type="button" aria-pressed={layer === "risk"} onClick={() => setLayer("risk")}><ShieldAlert size={13} /> Risk</button>
      </div>
    </div>
    <div className="atlas-network-path" aria-label="Current hierarchy path">
      <button type="button" onClick={() => navigate([])} aria-current={!current ? "location" : undefined}>All locations</button>
      {ancestors.map((node, index) => <span key={node.id}><ChevronRight size={12} /><button type="button" onClick={() => navigate(activePath.slice(0, index + 1))} aria-current={index === ancestors.length - 1 ? "location" : undefined}>{node.name}</button></span>)}
    </div>
    <div className="atlas-network-scene">
      <svg className="atlas-network-lines" viewBox="0 0 600 400" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="atlas-wire" x1="0" y1="80" x2="600" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="#628fff" stopOpacity="0" /><stop offset=".48" stopColor="#7ab4ff" stopOpacity=".65" /><stop offset="1" stopColor="#628fff" stopOpacity="0" /></linearGradient>
          <radialGradient id="atlas-halo"><stop stopColor="#458bff" stopOpacity=".26" /><stop offset="1" stopColor="#458bff" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="300" cy="200" rx="250" ry="135" fill="url(#atlas-halo)" />
        <g stroke="url(#atlas-wire)" strokeWidth=".8">
          {Array.from({ length: 9 }, (_, i) => <path key={`x${i}`} d={`M ${30 + i * 32} ${140 - i * 13} L ${315 + i * 32} ${315 - i * 13}`} />)}
          {Array.from({ length: 10 }, (_, i) => <path key={`y${i}`} d={`M ${30 + i * 31} ${140 + i * 19} L ${286 + i * 31} ${36 + i * 19}`} />)}
        </g>
        <ellipse cx="300" cy="200" rx="215" ry="118" transform="rotate(-22 300 200)" stroke="#82adff" strokeOpacity=".22" />
        <ellipse cx="300" cy="200" rx="235" ry="130" transform="rotate(-22 300 200)" stroke="#82adff" strokeOpacity=".1" strokeDasharray="2 8" />
        <g stroke="#91beff" strokeOpacity={visibleNodes.length ? ".6" : ".18"}>
          {visibleNodes.map((node, index) => <path key={node.id} d={`M 300 200 Q ${positions[index].x * 6} 200 ${positions[index].x * 6} ${positions[index].y * 4}`} />)}
        </g>
        <path className="atlas-scan-line" d="M 138 108 L 402 264" stroke="#a2c5ff" strokeWidth="2" strokeOpacity=".55" />
      </svg>
      <div className="atlas-network-core">
        {current ? <button type="button" className="atlas-core-mark atlas-core-back" onClick={() => navigate(activePath.slice(0, -1))} aria-label={`Back from ${current.name}`}><ArrowLeft size={28} /></button> : <span className="atlas-core-mark"><Network size={28} /></span>}
        <strong>{current ? current.name : "KRYPTON CORE"}</strong>
        <small>{current ? `${current.type.toUpperCase()} · ${current.branchCount} ${current.branchCount === 1 ? "branch" : "branches"}` : `${branches.length} connected ${branches.length === 1 ? "branch" : "branches"}`}</small>
      </div>
      {visibleNodes.map((node, index) => {
        const Icon = icons[node.type];
        return <button key={node.id} type="button" className={`atlas-node atlas-node-${node.type} ${node.atRiskCount > 0 ? "is-risk" : ""}`} style={{ left: `${positions[index].x}%`, top: `${positions[index].y}%` }} onClick={() => node.type === "branch" ? node.branch && onSelect(node.branch) : navigate([...activePath, node.id])} aria-label={node.type === "branch" ? `Open ${node.name} branch workspace` : `View ${node.name} ${node.type}`} title={`${node.type.toUpperCase()} · ${node.name} · ${nodeDetail(node)}`}>
          <span className="atlas-node-icon"><Icon size={17} /></span>
          <span><em>{node.type}</em><strong>{node.name}</strong><small>{nodeDetail(node)}</small></span>
        </button>;
      })}
      {!visible.length && <div className="atlas-network-empty"><span>{confirmed ? "Your network starts here" : "Waiting for branch telemetry"}</span><Link href={confirmed ? "/admin/branch-onboarding" : "/operations/branches"}>{confirmed ? <Plus size={14} /> : <Building2 size={14} />}{confirmed ? "Connect a branch" : "Check branch connection"}<ArrowUpRight size={14} /></Link></div>}
    </div>
    <div className="atlas-network-caption">
      <span><i /> {visible.length ? "Select a node to follow the network" : "Topology appears when branches connect"}</span>
      {pageCount > 1 ? <span className="atlas-network-pages"><button type="button" onClick={() => setPage(Math.max(0, activePage - 1))} disabled={activePage === 0} aria-label="Previous nodes"><ChevronLeft size={14} /></button>{activePage + 1} / {pageCount}<button type="button" onClick={() => setPage(Math.min(pageCount - 1, activePage + 1))} disabled={activePage === pageCount - 1} aria-label="Next nodes"><ChevronRight size={14} /></button></span> : <Link href="/operations/branches">Explore network <ArrowUpRight size={14} /></Link>}
    </div>
  </section>;
}
