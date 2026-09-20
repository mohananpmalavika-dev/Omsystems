"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { FileCheck2, FileVideo2, MonitorPlay, Play, Search, Siren } from "lucide-react";

type WorkflowStep = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const workflow: WorkflowStep[] = [
  { label: "Monitor", href: "/control-room", icon: MonitorPlay },
  { label: "Search", href: "/video-search", icon: Search },
  { label: "Review", href: "/playback/synced", icon: Play },
  { label: "Recordings", href: "/recordings", icon: FileVideo2 },
  { label: "Evidence", href: "/evidence", icon: FileCheck2 },
  { label: "Respond", href: "/incidents", icon: Siren },
];

function isCurrentRoute(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function InvestigationFlowNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="investigation-flow" aria-label="Surveillance investigation workflow">
      <div className="investigation-flow-context">
        <span>Surveillance workflow</span>
        <p>Monitor, investigate, preserve and respond</p>
      </div>
      <div className="investigation-flow-steps">
        {workflow.map(({ label, href, icon: Icon }, index) => {
          const current = isCurrentRoute(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={current ? "is-current" : undefined}
              aria-current={current ? "page" : undefined}
            >
              <span className="investigation-flow-index">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
