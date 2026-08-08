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
  Overview: "Estate-wide summaries and executive operational intelligence.",
  Respond: "Live response, alerts, incidents and notification workflows.",
  Intelligence: "AI analytics, digital twins and federated command capabilities.",
  "Investigate & report": "Search, playback, evidence and operational reporting.",
  "Infrastructure health": "Camera, recording, storage, network and gateway health.",
  "Fleet maintenance": "Assets, work orders, vendors, contracts and predictive care.",
  Privacy: "Purpose governance, privacy controls and breach management.",
  Assurance: "Compliance frameworks, controls, assessments, risks and evidence.",
  "Audit & activity": "Operator activity, branch compliance and technical audits.",
  Administration: "Organization, branch onboarding, integrations and account security.",
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
