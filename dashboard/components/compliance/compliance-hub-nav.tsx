"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, SlidersHorizontal, FileCheck2, Building2, Gauge } from "lucide-react";

export const COMPLIANCE_TABS = [
  { label: "Frameworks & Standards", href: "/compliance", icon: ShieldCheck },
  { label: "Compliance Controls", href: "/compliance/controls", icon: SlidersHorizontal },
  { label: "Evidence & Records", href: "/compliance/evidence", icon: FileCheck2 },
  { label: "Branch Compliance Audit", href: "/audit/branch-compliance", icon: Building2 },
  { label: "Camera Health Audit", href: "/audit/health", icon: Gauge },
];

export function ComplianceHubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-700/60 pb-1 mb-6 scrollbar-none">
      {COMPLIANCE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              isActive
                ? "bg-slate-800/90 text-emerald-400 border-emerald-500 shadow-sm"
                : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Icon size={14} className={isActive ? "text-emerald-400" : "text-slate-400"} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
