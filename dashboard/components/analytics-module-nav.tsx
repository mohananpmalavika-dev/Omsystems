"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  Camera,
  CarFront,
  ChartNoAxesCombined,
  CircleUserRound,
  Landmark,
  PackageSearch,
  Route,
  ScanFace,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { getVisibleNavigation, hasCustomMenuConfiguration, type MenuAccessUser } from "@/components/app-layout";
import { defaultRoleWorkspace } from "@/lib/role-workspaces";

const groups = [
  {
    label: "Operate",
    items: [
      { label: "Overview", href: "/analytics", permission: "/analytics", icon: Activity },
      { label: "Operational metrics", href: "/analytics/dashboard", permission: "/analytics", icon: BarChart3 },
      { label: "Alerts", href: "/analytics/alerts", permission: "/analytics/alerts", icon: ShieldAlert },
      { label: "Predictive operations", href: "/analytics/predictions", permission: "/analytics/predictions", icon: TrendingUp },
      { label: "Investigation", href: "/analytics/investigation", permission: "/analytics/investigation", icon: Route },
      { label: "Rules", href: "/analytics/rules", permission: "/analytics/rules", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Bank & NBFC risk",
    items: [
      { label: "Cash, vault & perimeter risk", href: "/analytics/banking", permission: "/analytics/banking", icon: Landmark },
      { label: "Authorised persons", href: "/analytics/banking/authorized-persons", permission: "/analytics/banking", icon: UserRoundCheck },
      { label: "NBFC watchlist monitoring", href: "/analytics/nbfc-watchlist", permission: "/analytics/banking", icon: CircleUserRound },
      { label: "Cash logistics", href: "/analytics/anpr-logistics", permission: "/analytics/anpr", icon: CarFront },
      { label: "Branch risk comparison", href: "/analytics/branch-comparison", permission: "/analytics/banking", icon: Building2 },
    ],
  },
  {
    label: "Video intelligence",
    items: [
      { label: "Face watchlists", href: "/analytics/face-recognition", permission: "/analytics/face-recognition", icon: ScanFace },
      { label: "Person re-ID", href: "/analytics/reid", permission: "/analytics", icon: Users },
      { label: "ANPR", href: "/analytics/anpr", permission: "/analytics/anpr", icon: CarFront },
      { label: "People", href: "/analytics/people", permission: "/analytics", icon: Users },
      { label: "Vehicles", href: "/analytics/vehicles", permission: "/analytics", icon: CarFront },
      { label: "Crowd", href: "/analytics/crowd", permission: "/analytics", icon: Users },
      { label: "Tailgating", href: "/analytics/tailgating", permission: "/analytics", icon: UserRoundCheck },
      { label: "Behaviour insights", href: "/analytics/behavioral", permission: "/analytics", icon: BrainCircuit },
      { label: "Fall detection", href: "/analytics/fall", permission: "/analytics", icon: AlertTriangle },
      { label: "Abandoned objects", href: "/analytics/abandoned-objects", permission: "/analytics", icon: PackageSearch },
      { label: "Obstruction", href: "/analytics/camera-obstruction", permission: "/analytics", icon: Camera },
      { label: "Tamper", href: "/analytics/camera-tamper", permission: "/analytics", icon: Camera },
      { label: "Industrial", href: "/analytics/industrial", permission: "/analytics", icon: ChartNoAxesCombined },
      { label: "Retail", href: "/analytics/retail", permission: "/analytics/retail", icon: BarChart3 },
    ],
  },
] as const;

function matches(pathname: string, href: string) {
  if (href === "/analytics") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AnalyticsModuleNav() {
  const pathname = usePathname() || "/analytics";
  const [operator, setOperator] = useState<MenuAccessUser | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (stored) setOperator(JSON.parse(stored));
    } catch {}
  }, []);

  const allowed = useMemo(() => {
    const paths = getVisibleNavigation(operator).flatMap((group) => group.items.map((item) => item.href));
    if (!hasCustomMenuConfiguration(operator)) paths.push(...defaultRoleWorkspace(operator?.role));
    return new Set(paths);
  }, [operator]);

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.permission) || allowed.has(item.href) || matches(pathname, item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav
      aria-label="Analytics module navigation"
      className="analytics-module-nav sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/95 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1600px] gap-3 overflow-x-auto pb-1">
        {visibleGroups.map((group) => (
          <div key={group.label} className="analytics-module-nav-group flex shrink-0 items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
            <span className="px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{group.label}</span>
            {group.items.map((item) => {
              const active = matches(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold transition ${
                    active
                      ? "analytics-module-nav-active bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
