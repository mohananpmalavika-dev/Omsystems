import type { ControlPlaneStore } from "../../control-plane-store.js";

export async function buildTimeline(store: ControlPlaneStore, tenantId: string, branchId: string) {
  const incidents = await store.listIncidents(tenantId, { branchId, limit: 200 }).catch(() => []);
  const predictive = await store.listPredictiveAlerts(tenantId).catch(() => []);
  const health = await store.getHealthCheckSummary?.(tenantId).catch(() => undefined);

  const items: any[] = [];
  for (const inc of incidents || []) items.push({ type: "incident", time: inc.occurredAt ?? inc.createdAt ?? inc.reportedAt ?? new Date().toISOString(), source: inc });
  for (const p of predictive || []) items.push({ type: "predictive", time: p.detectedAt ?? p.createdAt ?? new Date().toISOString(), source: p });
  if (health && health.events) {
    for (const ev of health.events) items.push({ type: "health", time: ev.occurredAt ?? ev.time ?? new Date().toISOString(), source: ev });
  }

  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return items;
}
