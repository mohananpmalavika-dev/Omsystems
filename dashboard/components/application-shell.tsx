"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

const authRoutes = ["/login", "/forgot-password", "/reset-password"];

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (isAuthRoute) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}
