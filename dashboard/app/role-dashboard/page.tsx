"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppLayout, type MenuAccessUser } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi } from "@/lib/api-client";
import { Activity, ArrowRight, BadgeCheck, Building2, FileCheck2, ShieldAlert, Siren } from "lucide-react";

type Outcome = { value: number | null; unit: string; sampleSize?: number; denominator?: number; label: string; status: "AVAILABLE" | "UNAVAILABLE"; reason?: string };
type OutcomeData = { window: { days: number }; cameraAvailability: Outcome; alertToVerification: Outcome; evidenceTurnaround: Outcome; auditExceptions: Outcome };
type WorkspaceLink = { href: string; title: string; description: string; icon: typeof Activity };

const roleCopy: Record<string, { title: string; description: string; routes: WorkspaceLink[] }> = {
  branch_manager: { title: "Branch reliability dashboard", description: "Keep branch security coverage available and resolve exceptions before oversight is affected.", routes: [{ href: "/operations/cameras", title: "What needs attention", description: "Review camera and recording exceptions at the affected branch.", icon: ShieldAlert }, { href: "/maintenance/health", title: "What to do", description: "Run health checks and assign a work order.", icon: Activity }, { href: "/operations/recording", title: "What proves it", description: "Confirm recording continuity after recovery.", icon: FileCheck2 }] },
  security_officer: { title: "Central SOC dashboard", description: "Triage verified signals, coordinate incidents, and preserve defensible evidence.", routes: [{ href: "/operations/alerts", title: "What needs attention", description: "Review unverified alerts and active incidents.", icon: ShieldAlert }, { href: "/incidents", title: "What to do", description: "Verify the event and follow the assigned SOP.", icon: Siren }, { href: "/evidence", title: "What proves it", description: "Record the decision and evidence chain.", icon: FileCheck2 }] },
  auditor: { title: "Audit assurance dashboard", description: "Review control evidence, branch coverage, and activity trails before a review.", routes: [{ href: "/audit/branch-compliance", title: "What needs attention", description: "Review open audit exceptions and missing evidence.", icon: ShieldAlert }, { href: "/compliance/controls", title: "What to do", description: "Assign remediation for the affected control.", icon: Activity }, { href: "/activity-report", title: "What proves it", description: "Retain the assessment, evidence, and access record.", icon: FileCheck2 }] },
  compliance_officer: { title: "Compliance assurance dashboard", description: "Track privacy, controls, and evidence across the NBFC branch estate.", routes: [{ href: "/compliance/findings", title: "What needs attention", description: "Review control findings and evidence gaps.", icon: ShieldAlert }, { href: "/compliance/controls", title: "What to do", description: "Assess the affected control and assign corrective action.", icon: Activity }, { href: "/compliance/evidence", title: "What proves it", description: "Close only with attached, auditable evidence.", icon: FileCheck2 }] },
};

const fallback = roleCopy.security_officer!;

function formatOutcome(metric: Outcome) {
  if (metric.value === null) return "Not yet available";
  if (metric.unit === "percent") return `${metric.value.toFixed(2)}%`;
  if (metric.unit === "milliseconds") return metric.value >= 3_600_000 ? `${(metric.value / 3_600_000).toFixed(1)}h` : `${Math.round(metric.value / 60_000)}m`;
  return String(metric.value);
}

export default function RoleDashboardPage() {
  const [user, setUser] = useState<MenuAccessUser | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([authApi.getCurrentUser(), fetch("/api/control/v1/dashboard/business-outcomes?windowDays=30", { credentials: "include", cache: "no-store" })])
      .then(async ([identity, response]) => {
        if (!response.ok) throw new Error("Business outcomes are currently unavailable.");
        const payload = await response.json();
        if (!active) return;
        setUser((identity as any)?.user ?? identity ?? null);
        setOutcomes(payload.data);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load this dashboard."); });
    return () => { active = false; };
  }, []);

  const copy = roleCopy[user?.role ?? ""] ?? fallback;
  const routes = copy.routes;

  return <AppLayout><main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
    <PageHero eyebrow="Role-specific NBFC operations" title={copy.title} description={copy.description} icon={user?.role === "branch_manager" ? Building2 : user?.role === "auditor" ? BadgeCheck : Siren} actions={<div className="page-hero-status"><Activity size={17}/><div><span>Reporting window</span><strong>Last {outcomes?.window.days ?? 30} days</strong></div></div>} />
    {error && <p className="mt-5 rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200" role="alert">{error}</p>}
    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="NBFC business outcomes">
      {outcomes && Object.values({ cameraAvailability: outcomes.cameraAvailability, alertToVerification: outcomes.alertToVerification, evidenceTurnaround: outcomes.evidenceTurnaround, auditExceptions: outcomes.auditExceptions }).map((metric) => {
        const observedCount = metric.denominator ?? metric.sampleSize;
        return <article key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p><strong className="mt-2 block text-2xl text-slate-100">{formatOutcome(metric)}</strong><p className="mt-2 min-h-5 text-xs text-slate-400">{metric.status === "AVAILABLE" ? `${observedCount ?? 0} observed record${observedCount === 1 ? "" : "s"}` : metric.reason}</p></article>;
      })}
    </section>
    <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-5"><header><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Operating loop</p><h2 className="mt-1 text-xl font-semibold text-slate-100">Attention, action, proof</h2></header><div className="mt-5 grid gap-3 md:grid-cols-3">{routes.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-cyan-400/50"><Icon size={20} className="text-cyan-300"/><h3 className="mt-4 font-semibold text-slate-100">{title}</h3><p className="mt-2 min-h-10 text-sm text-slate-400">{description}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-300">Open workspace <ArrowRight size={15}/></span></Link>)}</div></section>
  </main></AppLayout>;
}
