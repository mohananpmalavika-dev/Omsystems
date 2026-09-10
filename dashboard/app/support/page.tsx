"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, HelpCircle, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";

const supportOptions = [
  { title: "Platform health", description: "Check device, storage, recording, and connectivity status before escalating an issue.", href: "/maintenance/health", action: "Open health checks", icon: Activity },
  { title: "System management", description: "Review enrolled gateways, cameras, branches, and service connectivity.", href: "/admin/system", action: "Inspect the system", icon: Server },
  { title: "Account security", description: "Review your session, password controls, and protected account settings.", href: "/account/security", action: "Open account security", icon: LockKeyhole },
  { title: "Module directory", description: "Find every operational workspace and quick-create workflow in one catalog.", href: "/modules", action: "Browse all modules", icon: BookOpen },
];

export default function SupportPage() {
  const [user, setUser] = useState<MenuAccessUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

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

  return (
    <main className="support-page">
      <PageHero
        eyebrow="Help center"
        title="KryptonVision support"
        description="Troubleshoot common operational issues, find the right workspace, and collect useful context for your administrator."
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
      <section className="support-escalation">
        <div><span>Need administrator help?</span><h2>Include the page, time, and affected branch</h2><p>Share the exact workflow, the branch or device involved, the visible error message, and when the issue occurred. Never include passwords, camera credentials, or session tokens.</p></div>
        <Link href={actionHref(escalationTarget)} className="btn-secondary">
          {user ? activityAvailable ? "Review recent activity" : "Browse available modules" : "Sign in to review activity"}
        </Link>
      </section>
    </main>
  );
}
