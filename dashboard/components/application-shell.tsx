"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { GuardianFAB } from "@/components/guardian-ai/guardian-fab";
import { ApiErrorNotifier } from "@/components/api-error-notifier";
import { isPublicDashboardRoute } from "@/lib/session-navigation";

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><ApplicationShellContent>{children}</ApplicationShellContent></Suspense>;
}

function ApplicationShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  if (pathname === "/control-room" && searchParams?.get("wallWindow") === "true") {
    return <div className="app-shell wall-window-shell"><main className="experience-surface wall-window-surface" aria-label="Live camera wall window">{children}</main></div>;
  }
  return <>
    <ApiErrorNotifier />
    {isPublicDashboardRoute(pathname) ? <div className="public-experience" data-area={pathname.split("/")[1]}>{children}</div> : <AppLayout>{children}</AppLayout>}
    <GlobalAlertCenter />
    <GuardianFAB />
  </>;
}
