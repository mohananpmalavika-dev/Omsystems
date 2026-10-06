"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
      { href: "/reports/mis", label: "Management overview" },
      { href: "/reports/mis?groupBy=date", label: "Date-wise reports" },
      { href: "/reports/mis?groupBy=zone", label: "Zone-wise reports" },
      { href: "/reports/mis?groupBy=region", label: "Region-wise reports" },
      { href: "/reports/mis?groupBy=area", label: "Area-wise reports" },
      { href: "/reports/mis?groupBy=branch", label: "Branch-wise reports" },
      { href: "/reports/mis?tab=branch-opening", label: "Branch opening reports" },
      { href: "/analytics/alerts", label: "AI alert graphical reports" },
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

const routePath = (href: string) => href.split("?")[0];
const workspacePaths = new Set(stages.flatMap((stage) => stage.links.map((link) => routePath(link.href))));

export function CommandWorkspaceNav({
  pathname,
  visibleHrefs,
  unrestricted,
}: {
  pathname: string;
  visibleHrefs: Set<string>;
  unrestricted: boolean;
}) {
  const searchParams = useSearchParams();
  if (!workspacePaths.has(pathname)) return null;

  const availableStages = stages
    .map((stage) => ({
      ...stage,
      links: stage.links.filter((link) => unrestricted || visibleHrefs.has(link.href) || visibleHrefs.has(routePath(link.href))),
    }))
    .filter((stage) => stage.links.length > 0);
  const currentStage = stages.find((stage) => stage.links.some((link) => routePath(link.href) === pathname))!;
  const currentLink = currentStage.links.filter((link) => {
    if (routePath(link.href) !== pathname) return false;
    const query = new URLSearchParams(link.href.split("?")[1]);
    return Array.from(query).every(([key, value]) => searchParams?.get(key) === value);
  }).sort((a, b) => b.href.length - a.href.length)[0] ?? currentStage.links[0];
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
                  <Link key={link.href} href={link.href} className={currentLink.href === link.href ? "is-current" : undefined} aria-current={currentLink.href === link.href ? "page" : undefined}>
                    {link.label}{currentLink.href !== link.href && <ArrowUpRight size={12} aria-hidden="true" />}
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
