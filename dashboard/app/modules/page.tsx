"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  LayoutGrid,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react";
import { AppLayout, navigation, quickActions } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";

const groupDescriptions: Record<string, string> = {
  OPERATIONS: "Live control room, branch fleet, alert dispatch, incident response, and media streaming pipeline.",
  "HEALTH & HARDWARE LAB": "Deep 7-layer camera health, NVR/DVR monitors, hardware compatibility lab, SATA HDDs, and network telemetry.",
  "INVESTIGATE & PLAYBACK": "AI semantic video search, synchronized multi-camera playback, recording archives, and chain of custody evidence.",
  "INTELLIGENCE & AI": "Real-time AI command center, facial recognition, ANPR, crowd density, banking/industrial safety, and 3D digital twins.",
  "FLEET MAINTENANCE": "Hardware asset tracking, field work orders, vendor directory, AMC contracts, and predictive failure care.",
  "ASSURANCE & GOVERNANCE": "Regulatory compliance frameworks, control assessments, risk register, and DPIA privacy governance.",
  "AUDIT & REPORTING": "Executive morning digest, branch CCTV audits, camera health compliance, and immutable operator access logs.",
  ADMINISTRATION: "Tenants, RBAC permissions, zero-touch branch onboarding, AI quality registry, HA topology, and system management.",
};

export default function ModulesPage() {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return navigation;
    return navigation
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${group.label} ${item.label} ${item.href}`.toLowerCase().includes(normalized)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);
  const moduleCount = navigation.reduce((total, group) => total + group.items.length, 0);
  const visibleCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <AppLayout>
      <div className="module-directory-page">
        <PageHero
          eyebrow="Product directory"
          title="Every Sentinel Grid module"
          description="Find any operational workflow from one organized directory. Search by task, device, report or business function."
          icon={LayoutGrid}
          actions={(
            <div className="page-hero-status">
              <i />
              <div><span>Available capabilities</span><strong>{moduleCount} modules</strong></div>
            </div>
          )}
        />

        <section className="directory-summary" aria-label="Module directory summary">
          <article><span><LayoutGrid size={18} /></span><div><strong>{moduleCount}</strong><small>Operational modules</small></div></article>
          <article><span><Workflow size={18} /></span><div><strong>{quickActions.length}</strong><small>Quick-create workflows</small></div></article>
          <article><span><CheckCircle2 size={18} /></span><div><strong>{navigation.length}</strong><small>Business areas</small></div></article>
          <article><span><Sparkles size={18} /></span><div><strong>One</strong><small>Unified control plane</small></div></article>
        </section>

        <section className="directory-toolbar">
          <div className="directory-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all modules and workflows" /></div>
          <span>{visibleCount} {visibleCount === 1 ? "result" : "results"}</span>
        </section>

        <section className="directory-quick-actions">
          <header><div><span>Start a workflow</span><h2>Quick actions</h2></div><p>Common tasks that create or register operational records.</p></header>
          <div>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return <Link href={action.href} key={action.href}><span><Icon size={17} /></span><strong>{action.label}</strong><ArrowUpRight size={14} /></Link>;
            })}
          </div>
        </section>

        <div className="directory-groups">
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section className="directory-group" key={group.label}>
                <header>
                  <span className="directory-group-icon"><GroupIcon size={19} /></span>
                  <div><p>{group.items.length} modules</p><h2>{group.label}</h2><span>{groupDescriptions[group.label]}</span></div>
                </header>
                <div className="directory-module-grid">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link href={item.href} key={`${group.label}-${item.href}`}>
                        <span className="directory-module-icon"><Icon size={18} /></span>
                        <div><strong>{item.label}</strong><small>Open {group.label.toLowerCase()}</small></div>
                        <ArrowUpRight size={14} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {filteredGroups.length === 0 && (
            <div className="directory-empty"><Search size={28} /><strong>No modules found</strong><span>Try another term such as camera, audit, incident, privacy or maintenance.</span></div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
