"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, BrainCircuit, X } from "lucide-react";
import { analyticsApi } from "@/lib/api-client";
import { fetchOperationalAlerts } from "@/lib/api/operational-health";
import type { AnalyticsAlert } from "@/lib/types";
import type { OperationalAlert } from "@/lib/types/operational-health";

type TrayAlert = { id: string; source: "AI" | "Operational"; severity: string; status: string; title: string; detail?: string; occurredAt: string; href: string };
const POLL_INTERVAL_MS = 30_000;
const MAX_VISIBLE_NOTIFICATIONS = 4;

export function AlertNotificationTray() {
  const [notifications, setNotifications] = useState<TrayAlert[]>([]);
  const initialized = useRef(false);
  const seen = useRef(new Set<string>());
  const remember = useCallback((keys: string[]) => {
    for (const key of keys) seen.current.add(key);
    if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-500));
  }, []);
  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const [aiResult, operationalResult] = await Promise.allSettled([
      analyticsApi.listAlerts({ limit: 50, status: "new" }),
      fetchOperationalAlerts({ status: "active", limit: 50 }),
    ]);
    const aiAlerts = aiResult.status === "fulfilled" ? aiResult.value.data as AnalyticsAlert[] : [];
    const operationalAlerts = operationalResult.status === "fulfilled" ? operationalResult.value as OperationalAlert[] : [];
    const current = [
      ...aiAlerts.filter((alert) => ["new", "investigating", "escalated"].includes(alert.status)).map(toAiNotification),
      ...operationalAlerts.filter((alert) => ["active", "reopened"].includes(alert.status)).map(toOperationalNotification),
    ];
    const keys = current.map(notificationKey);
    if (!initialized.current) { remember(keys); initialized.current = true; return; }
    const fresh = current.filter((alert) => !seen.current.has(notificationKey(alert)));
    remember(keys);
    if (fresh.length) setNotifications((existing) => [...fresh, ...existing].slice(0, MAX_VISIBLE_NOTIFICATIONS));
  }, [remember]);
  useEffect(() => {
    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [poll]);
  if (!notifications.length) return null;
  return <aside className="alert-notification-tray" aria-live="polite" aria-label="New alerts">{notifications.map((alert) => <article className={`alert-notification-card severity-${alert.severity.toLowerCase()}`} key={notificationKey(alert)}><span className="alert-notification-icon" aria-hidden="true">{alert.source === "AI" ? <BrainCircuit size={17} /> : <AlertTriangle size={17} />}</span><div className="alert-notification-content"><div><b>{alert.source} alert</b><time dateTime={alert.occurredAt}>{formatTime(alert.occurredAt)}</time></div><strong>{alert.title}</strong>{alert.detail && <p>{alert.detail}</p>}<Link href={alert.href}><BellRing size={13} /> Open alert queue</Link></div><button type="button" aria-label={`Dismiss ${alert.title}`} onClick={() => setNotifications((current) => current.filter((item) => notificationKey(item) !== notificationKey(alert)))}><X size={15} /></button></article>)}</aside>;
}

function toAiNotification(alert: AnalyticsAlert): TrayAlert { return { id: alert.id, source: "AI", severity: alert.severity, status: alert.status, title: alert.title, detail: [alert.cameraName, alert.branchName].filter(Boolean).join(" · ") || alert.description, occurredAt: alert.lastDetectedAt || alert.createdAt, href: "/analytics/alerts" }; }
function toOperationalNotification(alert: OperationalAlert): TrayAlert { return { id: alert.id, source: "Operational", severity: alert.severity, status: alert.status, title: alert.title, detail: alert.branchName || alert.componentType, occurredAt: alert.detectedAt, href: "/operations/alerts" }; }
function notificationKey(alert: TrayAlert) { return `${alert.source}:${alert.id}:${alert.status}`; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
