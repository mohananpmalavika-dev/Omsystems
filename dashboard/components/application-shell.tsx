"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { isPublicDashboardRoute } from "@/lib/session-navigation";

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (isPublicDashboardRoute(pathname)) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}
