"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyticsApi } from "@/lib/api-client";
import type {
  AnalyticsAlert,
  AnalyticsAlertSummary,
  AnalyticsRule,
  Camera,
} from "@/lib/types";

export type AiEngineState = "checking" | "online" | "degraded" | "offline" | "unavailable";

export type AiCapabilityDomain = {
  id: string;
  name: string;
  description: string;
  capabilities: Array<{ id: string; name: string; description: string }>;
};

const EMPTY_SUMMARY: AnalyticsAlertSummary = {
  total: 0,
  open: 0,
  new: 0,
  critical: 0,
  highPriority: 0,
};

const TERMINAL_ALERT_STATUSES = new Set(["resolved", "false_alarm", "suppressed"]);

export function useLiveAiWall(cameras: Camera[], enabled = true) {
  const [rules, setRules] = useState<AnalyticsRule[]>([]);
  const [alerts, setAlerts] = useState<AnalyticsAlert[]>([]);
  const [summary, setSummary] = useState<AnalyticsAlertSummary>(EMPTY_SUMMARY);
  const [engineState, setEngineState] = useState<AiEngineState>("checking");
  const [capabilityDomains, setCapabilityDomains] = useState<AiCapabilityDomain[]>([]);
  const [capabilityCount, setCapabilityCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>();
  const requestSequenceRef = useRef(0);

  const cameraIds = useMemo(
    () => cameras.slice(0, 144).map((camera) => camera.id),
    [cameras],
  );
  const cameraSignature = cameraIds.join("|");

  const refresh = useCallback(async () => {
    if (!enabled || cameraIds.length === 0) {
      setRules([]);
      setAlerts([]);
      setSummary(EMPTY_SUMMARY);
      setLoading(false);
      setError(undefined);
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    try {
      const response = await analyticsApi.liveWall(cameraIds, 500);
      if (requestSequence !== requestSequenceRef.current) return;
      setRules(response.data.rules);
      setAlerts(response.data.alerts);
      setSummary(response.data.summary);
      setLastUpdatedAt(response.data.sampledAt);
      setError(undefined);
    } catch (reason) {
      if (requestSequence !== requestSequenceRef.current) return;
      setError(reason instanceof Error ? reason.message : "Live AI telemetry is unavailable");
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [cameraSignature, enabled]);

  useEffect(() => {
    if (!enabled) {
      setEngineState("unavailable");
      return;
    }
    let active = true;
    void Promise.allSettled([analyticsApi.engineHealth(), analyticsApi.capabilities()])
      .then(([healthResult, capabilityResult]) => {
        if (!active) return;
        if (healthResult.status === "fulfilled") {
          const status = String(healthResult.value?.status ?? "").toLowerCase();
          setEngineState(status === "degraded" ? "degraded" : ["ok", "online", "healthy"].includes(status) ? "online" : "offline");
        } else {
          setEngineState("offline");
        }
        if (capabilityResult.status === "fulfilled") {
          setCapabilityDomains(capabilityResult.value?.domains ?? []);
          setCapabilityCount(Number(capabilityResult.value?.summary?.capabilities ?? 0));
        }
      });
    return () => { active = false; };
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled || cameraIds.length === 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      requestSequenceRef.current += 1;
    };
  }, [cameraSignature, enabled, refresh]);

  const rulesByCamera = useMemo(() => groupByCamera(rules), [rules]);
  const alertsByCamera = useMemo(() => groupByCamera(alerts), [alerts]);
  const openAlerts = useMemo(
    () => alerts.filter((alert) => !TERMINAL_ALERT_STATUSES.has(alert.status)),
    [alerts],
  );
  const priorityCameraIds = useMemo(() => [...new Set(
    openAlerts
      .filter((alert) => alert.severity === "P1" || alert.severity === "P2")
      .map((alert) => alert.cameraId),
  )], [openAlerts]);

  return {
    rules,
    alerts,
    openAlerts,
    summary,
    rulesByCamera,
    alertsByCamera,
    priorityCameraIds,
    engineState,
    capabilityDomains,
    capabilityCount,
    loading,
    error,
    lastUpdatedAt,
    refresh,
  };
}

function groupByCamera<T extends { cameraId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.cameraId) ?? [];
    current.push(item);
    grouped.set(item.cameraId, current);
  }
  return grouped;
}
