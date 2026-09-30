"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Building2, Camera, ChevronRight, Layers, MapPin, Network, Plus, ShieldAlert } from "lucide-react";
import { buildBranchHierarchy, type BranchHierarchyNode, type NetworkBranch, type OrganizationTreeNode } from "@/lib/branch-hierarchy";

const icons = { zone: Network, region: Layers, area: MapPin, branch: Building2 };

export function CommandNetworkCanvas({ branches, organizationTree, confirmed }: {
  branches: NetworkBranch[];
  organizationTree: OrganizationTreeNode[];
  confirmed: boolean;
}) {
  const [layer, setLayer] = useState<"coverage" | "risk">("coverage");
  const [path, setPath] = useState<string[]>([]);
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

  return <section className="atlas-network" aria-label="Branch network hierarchy">
    <div className="atlas-network-toolbar">
      <span><Network size={15} /> ESTATE HIERARCHY</span>
      <div className="atlas-layer-switch" aria-label="Network data layer">
        <button type="button" aria-pressed={layer === "coverage"} onClick={() => setLayer("coverage")}><Camera size={13} /> Coverage</button>
        <button type="button" aria-pressed={layer === "risk"} onClick={() => setLayer("risk")}><ShieldAlert size={13} /> Risk</button>
      </div>
    </div>
    <div className="atlas-network-scene">
      <div className="atlas-hierarchy">
        <div className="atlas-hierarchy-heading">
          <div className="atlas-hierarchy-crumbs">
            <button type="button" onClick={() => setPath([])} aria-current={!current ? "location" : undefined}>All locations</button>
            {ancestors.map((node, index) => <span key={node.id}><ChevronRight size={12} /><button type="button" onClick={() => setPath(activePath.slice(0, index + 1))} aria-current={index === ancestors.length - 1 ? "location" : undefined}>{node.name}</button></span>)}
          </div>
          <p>{current ? `${current.type.toUpperCase()} / ${current.branchCount} ${current.branchCount === 1 ? "branch" : "branches"}` : `${branches.length} connected ${branches.length === 1 ? "branch" : "branches"}`}</p>
        </div>
        {current && <button type="button" className="atlas-hierarchy-back" onClick={() => setPath(activePath.slice(0, -1))}><ArrowLeft size={14} /> Back to {ancestors.length > 1 ? ancestors[ancestors.length - 2].name : "all locations"}</button>}
        {visible.length ? <div className="atlas-hierarchy-list">
          {visible.map((node) => {
            const Icon = icons[node.type];
            const detail = node.type === "branch"
              ? layer === "risk" ? `${node.branch?.risk?.level || "Unknown"} risk` : `${node.workingCount}/${node.cameraCount} cameras working`
              : layer === "risk" ? `${node.atRiskCount} at risk · ${node.branchCount} ${node.branchCount === 1 ? "branch" : "branches"}` : `${node.branchCount} ${node.branchCount === 1 ? "branch" : "branches"} · ${node.workingCount}/${node.cameraCount} cameras working`;
            const content = <><span className="atlas-hierarchy-icon"><Icon size={18} /></span><span className="atlas-hierarchy-copy"><small>{node.type}</small><strong>{node.name}</strong><span>{detail}</span></span><ChevronRight size={17} className="atlas-hierarchy-chevron" /></>;
            return node.type === "branch"
              ? <Link key={node.id} href={`/operations/branches/${encodeURIComponent(node.id)}`} className="atlas-hierarchy-card" aria-label={`Open ${node.name} branch workspace`}>{content}</Link>
              : <button key={node.id} type="button" className="atlas-hierarchy-card" onClick={() => setPath([...activePath, node.id])} aria-label={`View ${node.name} ${node.type}`}>{content}</button>;
          })}
        </div> : <div className="atlas-network-empty"><span>{confirmed ? "Your network starts here" : "Waiting for branch telemetry"}</span><Link href={confirmed ? "/admin/branch-onboarding" : "/operations/branches"}>{confirmed ? <Plus size={14} /> : <Building2 size={14} />}{confirmed ? "Connect a branch" : "Check branch connection"}<ArrowUpRight size={14} /></Link></div>}
      </div>
    </div>
    <div className="atlas-network-caption"><span><i /> {branches.length ? "Select a location to drill down to a branch" : "Topology appears when branches connect"}</span><Link href="/operations/branches">Explore network <ArrowUpRight size={14} /></Link></div>
  </section>;
}
