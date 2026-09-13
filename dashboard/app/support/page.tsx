"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, HelpCircle, LockKeyhole, Search, Server, ShieldCheck } from "lucide-react";
import { getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";

const supportOptions = [
  { title: "Platform health", description: "Check device, storage, recording, and connectivity status before escalating an issue.", href: "/maintenance/health", action: "Open health checks", icon: Activity },
  { title: "System management", description: "Review enrolled gateways, cameras, branches, and service connectivity.", href: "/admin/system", action: "Inspect the system", icon: Server },
  { title: "Account security", description: "Review your session, password controls, and protected account settings.", href: "/account/security", action: "Open account security", icon: LockKeyhole },
  { title: "Module directory", description: "Find every operational workspace and quick-create workflow in one catalog.", href: "/modules", action: "Browse all modules", icon: BookOpen },
];

const sectionGuidance: Record<string, { purpose: string; steps: string[] }> = {
  WORKSPACE: { purpose: "Find the tools and guidance available to your role.", steps: ["Choose the workspace that matches the task.", "Use search when you know the task but not the page name.", "Open only records you are authorized to view."] },
  OPERATIONS: { purpose: "Monitor live operations, verify an event, and coordinate the next response.", steps: ["Select the relevant branch, device, or incident.", "Review the current status and supporting video or telemetry.", "Acknowledge, escalate, or document the outcome according to your SOP."] },
  "DEVICE HEALTH & MAINTENANCE": { purpose: "Keep cameras, recorders, storage, gateways, and connectivity reliable.", steps: ["Filter to the affected branch or device.", "Review the health signal and recent timeline.", "Run an approved check or create a work order when action is needed."] },
  "INVESTIGATE & PLAYBACK": { purpose: "Find, review, and preserve video and evidence for an investigation.", steps: ["Set the correct time range and camera or branch.", "Review footage with the relevant event context.", "Create an evidence record or note findings when required."] },
  "INTELLIGENCE & AI": { purpose: "Review AI detections and configure approved video analytics workflows.", steps: ["Choose the relevant camera, zone, or rule.", "Verify the detection against video before acting.", "Record feedback or adjust only approved rules and thresholds."] },
  "FLEET MAINTENANCE": { purpose: "Plan, assign, and document preventative and corrective maintenance.", steps: ["Locate the asset, work order, or supplier record.", "Record the work performed and supporting notes.", "Confirm status and ownership before closing the task."] },
  "COMPLIANCE & GOVERNANCE": { purpose: "Manage controls, assessments, privacy, and evidence needed for assurance.", steps: ["Select the applicable requirement or control.", "Review evidence and identify any gap.", "Assign a corrective action and retain an audit trail."] },
  "AUDIT & REPORTING": { purpose: "Review operational history and produce traceable management reports.", steps: ["Set the date range and branch or location scope.", "Validate the figures and exceptions.", "Export or share only through the approved process."] },
  ADMINISTRATION: { purpose: "Set up organizations, access, devices, and platform settings safely.", steps: ["Confirm the organization and location scope.", "Review the impact before saving a change.", "Use least-privilege access and document important changes."] },
};

function guideFor(section: string, label: string) {
  const guidance = sectionGuidance[section] ?? {
    purpose: "Complete this operational task with the correct scope, review, and audit trail.",
    steps: ["Choose the relevant record or scope.", "Review the available information.", "Save or escalate the outcome according to your procedure."],
  };
  return { ...guidance, purpose: `${guidance.purpose} Use ${label} when this is the task you need to complete.` };
}

export default function SupportPage() {
  const [user, setUser] = useState<MenuAccessUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [guideQuery, setGuideQuery] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/control/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (mounted) setUser(data?.user ?? data ?? null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setSessionChecked(true);
      });
    return () => { mounted = false; };
  }, []);

  const availableHrefs = useMemo(() => new Set(
    user ? getVisibleNavigation(user).flatMap((group) => group.items.map((item) => item.href)) : [],
  ), [user]);
  const availableOptions = user
    ? supportOptions.filter((option) => (
      option.href === "/account/security" || option.href === "/modules" || availableHrefs.has(option.href)
    ))
    : supportOptions;
  const loginHref = (destination: string) => `/login?next=${encodeURIComponent(destination)}`;
  const actionHref = (destination: string) => user ? destination : loginHref(destination);
  const activityAvailable = availableHrefs.has("/activity-report");
  const escalationTarget = user && !activityAvailable ? "/modules" : "/activity-report";
  const pageGuides = useMemo(() => {
    const pages = user ? getVisibleNavigation(user).flatMap((group) => group.items.map((item) => ({ ...item, section: group.label }))) : [];
    const query = guideQuery.trim().toLowerCase();
    return pages.filter((page) => !query || `${page.label} ${page.section}`.toLowerCase().includes(query));
  }, [guideQuery, user]);

  return (
    <main className="support-page">
      <PageHero
        eyebrow="Help center"
        title="KryptonVision support"
        description="Find clear instructions for every workspace available to you, troubleshoot common issues, and collect useful context for your administrator."
        icon={HelpCircle}
        actions={<div className="page-hero-status"><ShieldCheck size={17} /><div><span>Recommended first step</span><strong>{user ? "Check platform health" : sessionChecked ? "Sign in to run diagnostics" : "Checking session…"}</strong></div></div>}
      />
      <section className="support-panel">
        <header><span>Self-service</span><h2>Resolve or diagnose an issue</h2><p>These checks cover the most common camera, gateway, session, and navigation problems.</p></header>
        <div className="support-option-grid">
          {availableOptions.map(({ title, description, href, action, icon: Icon }) => (
            <Link href={actionHref(href)} key={href}><span><Icon size={20} /></span><div><strong>{title}</strong><p>{description}</p><em>{user ? action : "Sign in to continue"}</em></div></Link>
          ))}
        </div>
      </section>
      <section className="support-panel support-guide">
        <header>
          <span>In-product user manual</span>
          <h2>What each page is for</h2>
          <p>Search a page name to see when to use it and the safe, standard workflow. Only pages available to your account are shown.</p>
        </header>
        <div className="support-guide-search"><Search size={17} /><input value={guideQuery} onChange={(event) => setGuideQuery(event.target.value)} placeholder="Search pages, such as camera, incident, cash, or report" aria-label="Search user manual pages" /></div>
        <div className="support-guide-list">
          {!user && <p className="support-guide-empty">Sign in to see the guide for the pages assigned to your role.</p>}
          {user && pageGuides.map((page) => {
            const guide = guideFor(page.section, page.label);
            return (
              <details key={page.href}>
                <summary><span><strong>{page.label}</strong><small>{page.section}</small></span><em>View guide</em></summary>
                <div className="support-guide-detail">
                  <p><b>Purpose:</b> {guide.purpose}</p>
                  <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <Link href={page.href}>Open {page.label}</Link>
                </div>
              </details>
            );
          })}
          {user && pageGuides.length === 0 && <p className="support-guide-empty">No assigned pages match that search. Try a broader term.</p>}
        </div>
      </section>
      <section className="support-escalation">
        <div><span>Need administrator help?</span><h2>Include the page, time, and affected branch</h2><p>Share the exact workflow, the branch or device involved, the visible error message, and when the issue occurred. Never include passwords, camera credentials, or session tokens.</p></div>
        <Link href={actionHref(escalationTarget)} className="btn-secondary">
          {user ? activityAvailable ? "Review recent activity" : "Browse available modules" : "Sign in to review activity"}
        </Link>
      </section>
    </main>
  );
}
