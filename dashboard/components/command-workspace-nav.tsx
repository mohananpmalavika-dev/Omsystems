"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BarChart3, FileText } from "lucide-react";

type WorkspaceLink = { href: string; label: string };

const dashboardLinks: WorkspaceLink[] = [
  { href: "/dashboards", label: "Executive" },
  { href: "/role-dashboard", label: "My workspace" },
  { href: "/mis-dashboard", label: "MIS dashboard" },
  { href: "/analytics/dashboard", label: "Analytics" },
];

const reportLinks: WorkspaceLink[] = [
  { href: "/reports", label: "Report studio" },
  { href: "/reports/mis", label: "Executive reports" },
  { href: "/reports/financial", label: "Cost & value" },
  { href: "/reports/compliance", label: "Compliance" },
  { href: "/reports/benchmarking", label: "Benchmarking" },
  { href: "/reports/ai-analytics/roi", label: "AI ROI" },
  { href: "/reports/ai-analytics/compare", label: "AI comparison" },
];

const workspacePaths = new Set([...dashboardLinks, ...reportLinks].map((link) => link.href));

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

  const isDashboard = dashboardLinks.some((link) => link.href === pathname);
  const groups = [
    { label: "Dashboards", icon: BarChart3, links: dashboardLinks },
    { label: "Reports", icon: FileText, links: reportLinks },
  ].map((group) => ({
    ...group,
    links: group.links.filter((link) =>
      link.href === pathname || unrestricted || visibleHrefs.has(link.href),
    ),
  })).filter((group) => group.links.length > 0);

  return (
    <nav className="command-workspace-nav" aria-label="Command Center dashboards and reports">
      <div className="command-workspace-nav-intro">
        <div>
          <p className="command-workspace-nav-kicker"><span /> COMMAND CENTER / {isDashboard ? "DASHBOARDS" : "REPORTS"}</p>
          <strong>From live operations to decision-ready insight.</strong>
        </div>
        <Link href="/" className="command-workspace-nav-back"><ArrowLeft size={14} /> Command Center</Link>
      </div>
      <div className="command-workspace-nav-groups">
        {groups.map(({ label, icon: Icon, links }) => (
          <div className="command-workspace-nav-group" key={label}>
            <span className="command-workspace-nav-label"><Icon size={14} /> {label}</span>
            <div className="command-workspace-nav-links">
              {links.map(({ href, label: linkLabel }) => (
                <Link key={href} href={href} className={pathname === href ? "is-current" : undefined} aria-current={pathname === href ? "page" : undefined}>
                  {linkLabel}{pathname !== href && <ArrowUpRight size={12} aria-hidden="true" />}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
