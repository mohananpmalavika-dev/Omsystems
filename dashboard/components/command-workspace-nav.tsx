"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, FileText, Layers3 } from "lucide-react";

type WorkspaceLink = { href: string; label: string };
type JourneyStage = {
  number: string;
  label: string;
  title: string;
  description: string;
  links: WorkspaceLink[];
};

const stages: JourneyStage[] = [
  {
    number: "01",
    label: "Observe",
    title: "Read the estate",
    description: "See health, risk and change across your operation.",
    links: [
      { href: "/dashboards", label: "Executive" },
      { href: "/role-dashboard", label: "My workspace" },
      { href: "/mis-dashboard", label: "MIS dashboard" },
      { href: "/analytics/dashboard", label: "Analytics" },
    ],
  },
  {
    number: "02",
    label: "Interpret",
    title: "Find the meaning",
    description: "Compare outcomes and understand the evidence.",
    links: [
      { href: "/reports/mis", label: "Executive reports" },
      { href: "/reports/financial", label: "Cost & value" },
      { href: "/reports/compliance", label: "Compliance" },
      { href: "/reports/benchmarking", label: "Benchmarking" },
      { href: "/reports/ai-analytics/roi", label: "AI ROI" },
      { href: "/reports/ai-analytics/compare", label: "AI comparison" },
    ],
  },
  {
    number: "03",
    label: "Deliver",
    title: "Make the record",
    description: "Build, schedule and retrieve an auditable report.",
    links: [{ href: "/reports", label: "Report studio" }],
  },
];

const workspacePaths = new Set(stages.flatMap((stage) => stage.links.map((link) => link.href)));

export function CommandWorkspaceNav({
  pathname,
  visibleHrefs,
  unrestricted,
}: {
  pathname: string;
  visibleHrefs: Set<string>;
  unrestricted: boolean;
}) {
  if (!workspacePaths.has(pathname)) return null;

  const availableStages = stages
    .map((stage) => ({
      ...stage,
      links: stage.links.filter((link) => link.href === pathname || unrestricted || visibleHrefs.has(link.href)),
    }))
    .filter((stage) => stage.links.length > 0);
  const currentStage = stages.find((stage) => stage.links.some((link) => link.href === pathname))!;
  const currentLink = currentStage.links.find((link) => link.href === pathname)!;
  const nextStage = availableStages.find((stage) => Number(stage.number) > Number(currentStage.number));
  const nextLink = nextStage?.links[0]
    ?? availableStages.find((stage) => stage.number !== currentStage.number)?.links[0];

  return (
    <nav className="command-workspace-nav" aria-label="Dashboards and reports journey">
      <div className="command-workspace-nav-masthead">
        <div className="command-workspace-nav-intro">
          <p className="command-workspace-nav-kicker"><span aria-hidden="true" /> KRYPTON / INSIGHT CIRCUIT</p>
          <div className="command-workspace-nav-title-row">
            <Layers3 size={25} aria-hidden="true" />
            <h2>From signal to story.</h2>
          </div>
          <p>Follow a clear path from operational data to a decision you can explain.</p>
        </div>
        <div className="command-workspace-nav-position" aria-label={`Stage ${currentStage.number} of 03: ${currentStage.label}`}>
          <span>CURRENT POSITION</span>
          <strong>{currentStage.number}<i>/ 03</i></strong>
          <small>{currentLink.label}</small>
        </div>
      </div>

      <div className="command-workspace-nav-stages" style={{ gridTemplateColumns: `repeat(${availableStages.length}, minmax(0, 1fr))` }}>
        {availableStages.map((stage) => {
          const active = stage.number === currentStage.number;
          const Icon = stage.number === "01" ? BarChart3 : FileText;
          return (
            <section className={`command-workspace-nav-stage${active ? " is-active" : ""}`} key={stage.number} aria-label={`${stage.label}: ${stage.title}`}>
              <div className="command-workspace-nav-stage-heading">
                <span className="command-workspace-nav-index">{stage.number}</span>
                <Icon size={17} aria-hidden="true" />
                <span>{stage.label}</span>
              </div>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
              <div className="command-workspace-nav-links">
                {stage.links.map((link) => (
                  <Link key={link.href} href={link.href} className={pathname === link.href ? "is-current" : undefined} aria-current={pathname === link.href ? "page" : undefined}>
                    {link.label}{pathname !== link.href && <ArrowUpRight size={12} aria-hidden="true" />}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {nextLink && (
        <div className="command-workspace-nav-next">
          <span>NEXT IN THE CIRCUIT</span>
          <p>{currentStage.number === "03" ? "Start a new analysis from the live view." : "Keep the context moving into the next workspace."}</p>
          <Link href={nextLink.href}>{nextLink.label}<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      )}
    </nav>
  );
}
