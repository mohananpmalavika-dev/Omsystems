"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Camera, ShieldAlert, Network, Plus } from "lucide-react";

type NetworkBranch = {
  branchId: string;
  name?: string;
  branchCode?: string;
  operationalState?: string;
  cameras?: { total?: number; working?: number; healthy?: number };
  risk?: { level?: string };
};
const positions = [{ x: 23, y: 25 }, { x: 74, y: 20 }, { x: 84, y: 58 }, { x: 58, y: 78 }, { x: 17, y: 68 }, { x: 47, y: 12 }];

export function CommandNetworkCanvas({ branches, confirmed, onSelect }: {
  branches: NetworkBranch[];
  confirmed: boolean;
  onSelect: (branch: NetworkBranch) => void;
}) {
  const [layer, setLayer] = useState<"coverage" | "risk">("coverage");
  const visible = branches.slice(0, positions.length);
  return <section className="atlas-network" aria-label="Branch network overview">
    <div className="atlas-network-toolbar">
      <span><Network size={15} /> BRANCH CONSTELLATION</span>
      <div className="atlas-layer-switch" aria-label="Network data layer">
        <button type="button" aria-pressed={layer === "coverage"} onClick={() => setLayer("coverage")}><Camera size={13} /> Coverage</button>
        <button type="button" aria-pressed={layer === "risk"} onClick={() => setLayer("risk")}><ShieldAlert size={13} /> Risk</button>
      </div>
    </div>
    <div className="atlas-network-scene">
      <svg className="atlas-network-lines" viewBox="0 0 600 400" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="atlas-wire" x1="0" y1="80" x2="600" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="#628fff" stopOpacity="0" /><stop offset=".48" stopColor="#7ab4ff" stopOpacity=".65" /><stop offset="1" stopColor="#628fff" stopOpacity="0" /></linearGradient>
          <radialGradient id="atlas-halo"><stop stopColor="#458bff" stopOpacity=".26" /><stop offset="1" stopColor="#458bff" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="300" cy="245" rx="250" ry="135" fill="url(#atlas-halo)" />
        <g stroke="url(#atlas-wire)" strokeWidth=".8">
          {Array.from({ length: 9 }, (_, i) => <path key={`x${i}`} d={`M ${30 + i * 32} ${140 - i * 13} L ${315 + i * 32} ${315 - i * 13}`} />)}
          {Array.from({ length: 10 }, (_, i) => <path key={`y${i}`} d={`M ${30 + i * 31} ${140 + i * 19} L ${286 + i * 31} ${36 + i * 19}`} />)}
        </g>
        <ellipse cx="300" cy="210" rx="215" ry="118" transform="rotate(-22 300 210)" stroke="#82adff" strokeOpacity=".22" />
        <ellipse cx="300" cy="210" rx="235" ry="130" transform="rotate(-22 300 210)" stroke="#82adff" strokeOpacity=".1" strokeDasharray="2 8" />
        <ellipse cx="300" cy="210" rx="150" ry="90" transform="rotate(28 300 210)" stroke="#82adff" strokeOpacity=".18" />
        <g stroke="#91beff" strokeOpacity={visible.length ? ".6" : ".18"} strokeDasharray={visible.length ? undefined : "4 7"}>
          {visible.map((branch, i) => <path key={branch.branchId} d={`M 300 210 Q ${positions[i].x * 6} 210 ${positions[i].x * 6} ${positions[i].y * 4}`} />)}
          {!visible.length && <><path d="M 300 210 L 138 100" /><path d="M 300 210 L 444 80" /><path d="M 300 210 L 504 232" /><path d="M 300 210 L 102 272" /></>}
        </g>
        <path className="atlas-scan-line" d="M 138 108 L 402 264" stroke="#a2c5ff" strokeWidth="2" strokeOpacity=".55" />
      </svg>
      <div className="atlas-network-core"><span className="atlas-core-mark"><Network size={28} /></span><strong>KRYPTON CORE</strong><small>{visible.length ? `${branches.length} connected branches` : "Awaiting connection"}</small></div>
      {visible.map((branch, i) => <button key={branch.branchId} type="button" className={`atlas-node ${branch.risk?.level === "HIGH" ? "is-risk" : ""}`} style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }} onClick={() => onSelect(branch)} aria-label={`Open ${branch.name || branch.branchCode} workspace`}>
        <span className="atlas-node-icon"><Building2 size={17} /></span>
        <span><strong>{branch.name || branch.branchCode || "Branch"}</strong><small>{layer === "risk" ? `${branch.risk?.level || "Unknown"} risk` : `${branch.cameras?.working ?? branch.cameras?.healthy ?? "—"}/${branch.cameras?.total ?? "—"} cameras working`}</small></span>
      </button>)}
      {!visible.length && <div className="atlas-network-empty"><span>{confirmed ? "Your network starts here" : "Waiting for branch telemetry"}</span><Link href={confirmed ? "/admin/branch-onboarding" : "/operations/branches"}>{confirmed ? <Plus size={14} /> : <Building2 size={14} />}{confirmed ? "Connect a branch" : "Check branch connection"}<ArrowUpRight size={14} /></Link></div>}
    </div>
    <div className="atlas-network-caption"><span><i /> {visible.length ? "Select a branch to investigate" : "Topology appears when branches connect"}</span><Link href="/operations/branches">Explore network <ArrowUpRight size={14} /></Link></div>
  </section>;
}
