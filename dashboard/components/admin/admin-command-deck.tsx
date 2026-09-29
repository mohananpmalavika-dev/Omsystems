"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Camera,
  Cpu,
  FileSpreadsheet,
  Fingerprint,
  Gauge,
  Network,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FieldVisual } from "@/components/field-visual";

type AdminAction = { label: string; detail: string; href: string; icon: LucideIcon };

const primaryActions: AdminAction[] = [
  { label: "Add an employee", detail: "Identity & access", href: "/admin?tab=users&action=create-user", icon: Fingerprint },
  { label: "Onboard a branch", detail: "Gateway to first feed", href: "/admin/branch-onboarding", icon: Building2 },
  { label: "Review permissions", detail: "Roles & scope", href: "/admin/organization?tab=roles", icon: ShieldCheck },
  { label: "Connect cameras", detail: "Import & verify", href: "/admin/camera-import-export", icon: Camera },
  { label: "Check system", detail: "Health & settings", href: "/admin/system", icon: Gauge },
  { label: "Activate gateway", detail: "Zero-touch setup", href: "/admin/zero-touch", icon: Cpu },
];

const relatedActions: Record<string, AdminAction[]> = {
  organization: [primaryActions[0], primaryActions[1], primaryActions[2]],
  "branch-onboarding": [primaryActions[5], primaryActions[3], primaryActions[4]],
  "zero-touch": [primaryActions[1], { label: "Fleet diagnostics", detail: "Gateway & camera telemetry", href: "/admin/zero-touch/diagnostics", icon: Gauge }, primaryActions[4]],
  system: [primaryActions[5], primaryActions[3], { label: "HA topology", detail: "Resilience", href: "/admin/ha-topology", icon: Network }],
  features: [{ label: "Capabilities", detail: "Platform", href: "/admin/platform/capabilities", icon: Settings2 }, { label: "AI quality", detail: "Models", href: "/admin/ai-quality", icon: Sparkles }, primaryActions[4]],
};

function actionLink(action: AdminAction, index: number, compact = false) {
  const Icon = action.icon;
  const content = <><span className="admin-command-action-icon"><Icon size={compact ? 16 : 21} /></span><span className="admin-command-action-copy"><strong>{action.label}</strong><small>{action.detail}</small></span>{compact ? <ArrowUpRight size={15} /> : <span className="admin-command-action-end"><em>{String(index + 1).padStart(2, "0")}</em><ArrowUpRight size={17} /></span>}</>;
  // This route opens an existing form from the query string; a full navigation
  // also works when the operator is already on /admin.
  return action.href.includes("action=create-user")
    ? <a key={action.href} href={action.href} className="admin-command-action">{content}</a>
    : <Link key={action.href} href={action.href} className="admin-command-action">{content}</Link>;
}

export function AdminCommandDeck() {
  const pathname = usePathname() || "/admin";

  if (pathname !== "/admin") {
    const segment = pathname.split("/")[2] || "system";
    const actions = relatedActions[segment] ?? [primaryActions[1], primaryActions[2], primaryActions[4]];
    return <nav className="admin-command-rail" aria-label="Related administration actions">
      <Link href="/admin" className="admin-command-rail-home"><span><Settings2 size={17} /></span><strong>Admin command</strong><ArrowRight size={15} /></Link>
      <span className="admin-command-rail-label">NEXT ACTIONS</span>
      <div>{actions.map((action, index) => actionLink(action, index, true))}</div>
    </nav>;
  }

  return <section className="admin-command-deck" aria-labelledby="admin-command-title">
    <header className="admin-command-deck-top"><span><i />KRYPTON / ADMIN COMMAND</span><span>CONTROL PLANE <b>01</b></span></header>
    <div className="admin-command-deck-stage">
      <div className="admin-command-deck-intro"><span className="admin-command-deck-eyebrow">YOUR NEXT MOVE / ADMINISTRATION</span><h1 id="admin-command-title">Run the<br /><em>estate.</em></h1><p>People, branches and systems—one move to the work that matters.</p><div className="admin-command-deck-note"><ShieldCheck size={17} />Choose a task to open its existing workflow.</div></div>
      <div className="admin-command-deck-visual"><FieldVisual /><span>CONNECTED CONTROL PLANE</span></div>
    </div>
    <div className="admin-command-deck-actions"><div><span>DIRECT ACTIONS</span><strong>Start with an outcome.</strong></div><nav aria-label="Administration direct actions">{primaryActions.map((action, index) => actionLink(action, index))}</nav></div>
    <footer className="admin-command-deck-footer"><span><Network size={14} /> ONE ADMIN WORKSPACE</span><Link href="/admin/organization">Explore organization <FileSpreadsheet size={14} /></Link></footer>
  </section>;
}
