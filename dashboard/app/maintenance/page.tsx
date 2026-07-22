"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { maintenanceApi } from "@/lib/api-client";
import {
  AlertList,
  HealthMetricDisplay,
  WorkOrderCard,
} from "@/components/maintenance/dashboard-components";

export default function MaintenancePage() {
  const [status, setStatus] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [firmwareUpdates, setFirmwareUpdates] = useState<any[]>([]);
  const [firmwareCatalog, setFirmwareCatalog] = useState<any[]>([]);
  const [lowStockParts, setLowStockParts] = useState<any[]>([]);
  const [highRiskAssets, setHighRiskAssets] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradePlanSubmitting, setUpgradePlanSubmitting] = useState(false);
  const [upgradePlanResult, setUpgradePlanResult] = useState<any>(null);
  const [upgradePayload, setUpgradePayload] = useState({
    firmwareVersionId: "",
    targetAssets: "",
    strategy: "single-device" as "single-device" | "test-group" | "canary-rollout" | "branch-by-branch" | "region-by-region" | "scheduled-fleet-rollout" | "emergency-security-rollout",
    safetyContext: {
      modelConfirmed: true,
      exactVersionConfirmed: true,
      powerConfirmed: true,
      upsConfirmed: true,
      networkStable: true,
      backupCompleted: true,
      redundancyVerified: true,
      activeIncidentsPresent: false,
      alertsSuspended: true,
      maintenanceWindowApproved: true,
      rollbackPlanned: true,
      packageVerified: true,
      compatibilityVerified: true,
    },
  });

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([
      maintenanceApi.getDashboardStatus(),
      maintenanceApi.getDashboardHealth(),
      maintenanceApi.listFirmwareUpdatesRequired(),
      maintenanceApi.listFirmwareCatalog(),
      maintenanceApi.listLowStockParts(),
      maintenanceApi.listHighRiskAssets(),
      maintenanceApi.getMaintenanceMetrics(),
    ])
      .then(([statusData, healthData, firmware, firmwareCatalogData, lowStock, highRisk, metrics]) => {
        setStatus(statusData);
        setHealth(healthData);
        setFirmwareUpdates(firmware.data ?? []);
        setFirmwareCatalog(firmwareCatalogData.data ?? []);
        setLowStockParts(lowStock.data ?? []);
        setHighRiskAssets(highRisk.data ?? []);
        setCompliance(metrics ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load maintenance dashboard.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!upgradePayload.firmwareVersionId && firmwareCatalog[0]?.id) {
      setUpgradePayload((previous) => ({
        ...previous,
        firmwareVersionId: firmwareCatalog[0].id,
      }));
    }
  }, [firmwareCatalog, upgradePayload.firmwareVersionId]);

  const alertItems = (status?.predictiveAlerts ?? []).slice(0, 6).map((item: any) => ({
    id: item.id,
    severity:
      item.score > 0.8
        ? "critical"
        : item.score > 0.5
        ? "warning"
        : "info",
    title: item.alertType || item.type || "Predictive alert",
    description: item.details?.summary || item.details?.message || `Risk score ${item.score}`,
    timestamp: item.detectedAt ? new Date(item.detectedAt) : new Date(),
    acknowledged: item.status !== "open",
  }));

  const recentWorkOrders = (status?.workOrders ?? []).slice(0, 4);

  const handleCreateUpgradePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setUpgradePlanSubmitting(true);
    setUpgradePlanResult(null);
    setError(null);

    try {
      const plan = await maintenanceApi.createFirmwareUpgradePlan({
        firmwareVersionId: upgradePayload.firmwareVersionId,
        targetAssets: upgradePayload.targetAssets
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        strategy: upgradePayload.strategy,
        safetyContext: upgradePayload.safetyContext,
      });
      setUpgradePlanResult(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create firmware upgrade plan.");
    } finally {
      setUpgradePlanSubmitting(false);
    }
  };

  const toggleSafetyCheck = (field: keyof typeof upgradePayload.safetyContext) => {
    setUpgradePayload((previous) => ({
      ...previous,
      safetyContext: {
        ...previous.safetyContext,
        [field]: !previous.safetyContext[field],
      },
    }));
  };

  return (
    <AppLayout>
      <div className="content">
        <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Maintenance Dashboard</h1>
        <p style={{ color: "#555" }}>
          Operational health, predictive alerts, firmware updates, and maintenance status in one place.
        </p>
      </header>

      {error && (
        <div style={{ marginBottom: 20, padding: 16, background: "#fee", border: "1px solid #fbb", color: "#800" }}>
          {error}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 12 }}>Assets</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : status?.totalAssets ?? "—"}</p>
          <p style={{ color: "#666" }}>Total tracked assets</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 12 }}>Open work orders</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : status?.workOrdersOpen ?? "—"}</p>
          <p style={{ color: "#666" }}>Pending and active maintenance tasks</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 12 }}>AMC contracts</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : status?.amcContractsActive ?? "—"}</p>
          <p style={{ color: "#666" }}>Active coverage agreements</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 12 }}>Firmware updates</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : firmwareUpdates.length}</p>
          <p style={{ color: "#666" }}>Devices needing firmware action</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 12 }}>Device management</h2>
          <p style={{ margin: 0, color: "#374151" }}>Secure rotation, templates, and IP assignments</p>
          <Link href="/maintenance/device-management" style={{ display: "inline-block", marginTop: 16, color: "#2563eb" }}>
            Open device management
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <HealthMetricDisplay
            label="Health score"
            value={health?.healthPercentage ?? 0}
            unit="%"
            status={health?.healthPercentage >= 90 ? "healthy" : health?.healthPercentage >= 70 ? "warning" : "critical"}
            trend="stable"
          />
          <HealthMetricDisplay
            label="Overdue visits"
            value={health?.overdueVisits ?? 0}
            unit=""
            status={health?.overdueVisits > 0 ? "critical" : "healthy"}
          />
          <HealthMetricDisplay
            label="Open issues"
            value={health?.openWorkOrders ?? 0}
            unit=""
            status={health?.openWorkOrders > 5 ? "critical" : health?.openWorkOrders > 0 ? "warning" : "healthy"}
          />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2>Recent alerts</h2>
            <Link href="/maintenance/predictive" style={{ color: "#2563eb" }}>View all</Link>
          </div>
          <AlertList alerts={alertItems} />
        </div>

        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 16 }}>Upcoming actions</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: 16, border: "1px solid #d1d5db", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Maintenance due</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{status?.visitsPending ?? 0}</p>
            </div>
            <div style={{ padding: 16, border: "1px solid #d1d5db", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>AMCs expiring soon</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{status?.amcContractsExpiring ?? 0}</p>
            </div>
            <div style={{ padding: 16, border: "1px solid #d1d5db", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Low stock parts</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{lowStockParts.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 16 }}>Firmware updates required</h2>
          {firmwareUpdates.length === 0 ? (
            <p style={{ color: "#4b5563" }}>No devices require firmware updates.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {firmwareUpdates.slice(0, 5).map((item) => (
                <li key={item.id} style={{ marginBottom: 12 }}>
                  <strong>{item.deviceType}</strong> • {item.currentVersion} → {item.latestVersion ?? "unknown"}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 16 }}>Firmware inventory</h2>
          {firmwareCatalog.length === 0 ? (
            <p style={{ color: "#4b5563" }}>No firmware packages are registered yet.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {firmwareCatalog.slice(0, 5).map((item) => (
                <li key={item.id} style={{ marginBottom: 12 }}>
                  <strong>{item.vendor} {item.model}</strong> • {item.version} • {item.status}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 16 }}>Low stock parts</h2>
          {lowStockParts.length === 0 ? (
            <p style={{ color: "#4b5563" }}>Stock levels are healthy.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {lowStockParts.slice(0, 5).map((part) => (
                <li key={part.id} style={{ marginBottom: 12 }}>
                  <strong>{part.partName}</strong> • Qty {part.quantity} / Reorder {part.reorderLevel}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", marginBottom: 24 }}>
        <h2 style={{ marginBottom: 16 }}>Firmware upgrade planner</h2>
        <p style={{ color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
          Create a safety-gated rollout plan that checks package verification, compatibility, maintenance windows, and rollback readiness before deployment.
        </p>
        <form onSubmit={handleCreateUpgradePlan} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Firmware version ID</span>
              <input
                value={upgradePayload.firmwareVersionId}
                onChange={(event) => setUpgradePayload((previous) => ({ ...previous, firmwareVersionId: event.target.value }))}
                placeholder="Select a registered firmware version"
                style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Target assets</span>
              <input
                value={upgradePayload.targetAssets}
                onChange={(event) => setUpgradePayload((previous) => ({ ...previous, targetAssets: event.target.value }))}
                placeholder="cam-001, cam-002"
                style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Strategy</span>
              <select
                value={upgradePayload.strategy}
                onChange={(event) => setUpgradePayload((previous) => ({ ...previous, strategy: event.target.value as typeof upgradePayload.strategy }))}
                style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
              >
                <option value="single-device">Single device</option>
                <option value="test-group">Test group</option>
                <option value="canary-rollout">Canary rollout</option>
                <option value="branch-by-branch">Branch by branch</option>
                <option value="region-by-region">Region by region</option>
                <option value="scheduled-fleet-rollout">Scheduled fleet rollout</option>
                <option value="emergency-security-rollout">Emergency security rollout</option>
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {[
              ["modelConfirmed", "Model confirmed"],
              ["exactVersionConfirmed", "Exact version confirmed"],
              ["powerConfirmed", "Power confirmed"],
              ["upsConfirmed", "UPS confirmed"],
              ["networkStable", "Network stable"],
              ["backupCompleted", "Backup completed"],
              ["redundancyVerified", "Redundancy verified"],
              ["activeIncidentsPresent", "No active incidents"],
              ["alertsSuspended", "Alerts suspended"],
              ["maintenanceWindowApproved", "Window approved"],
              ["rollbackPlanned", "Rollback planned"],
              ["packageVerified", "Package verified"],
              ["compatibilityVerified", "Compatibility verified"],
            ].map(([field, label]) => {
              const key = field as keyof typeof upgradePayload.safetyContext;
              return (
                <label key={field} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={upgradePayload.safetyContext[key]}
                    onChange={() => toggleSafetyCheck(key)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={upgradePlanSubmitting || !upgradePayload.firmwareVersionId || !upgradePayload.targetAssets}
            style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", maxWidth: 220 }}
          >
            {upgradePlanSubmitting ? "Creating plan…" : "Create upgrade plan"}
          </button>
        </form>

        {upgradePlanResult && (
          <div style={{ marginTop: 16, padding: 12, border: "1px solid #d1d5db", borderRadius: 10, background: "#f9fafb" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Plan status: {upgradePlanResult.status}</p>
            <p style={{ margin: "0 0 8px" }}>Targets: {upgradePlanResult.targetAssets.join(", ")}</p>
            {upgradePlanResult.safetyChecks?.blockers?.length > 0 && (
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Blockers</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {upgradePlanResult.safetyChecks.blockers.map((item: string) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {upgradePlanResult.safetyChecks?.warnings?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Warnings</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {upgradePlanResult.safetyChecks.warnings.map((item: string) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2>Recent work orders</h2>
          <Link href="/maintenance/workorders" style={{ color: "#2563eb" }}>View all</Link>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {recentWorkOrders.length === 0 ? (
            <p style={{ color: "#4b5563" }}>No active work orders available.</p>
          ) : (
            recentWorkOrders.map((wo: any) => (
              <WorkOrderCard
                key={wo.id}
                id={wo.id}
                title={wo.problem || wo.title || "Maintenance task"}
                description={wo.actionTaken || wo.rootCause || "Pending maintenance work order."}
                status={wo.status === "in_progress" ? "in-progress" : wo.status || "open"}
                priority={wo.severity || "medium"}
                assignedTo={wo.technician ?? wo.assignedTo}
                dueDate={wo.slaDueAt ? new Date(wo.slaDueAt) : undefined}
                createdDate={new Date(wo.createdAt ?? Date.now())}
              />
            ))
          )}
        </div>
      </section>

      <section style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
        <h2 style={{ marginBottom: 16 }}>Quick actions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Link href="/maintenance/assets">Assets</Link>
          <Link href="/maintenance/workorders">Work orders</Link>
          <Link href="/maintenance/vendors">Vendors</Link>
          <Link href="/maintenance/amc">AMC contracts</Link>
          <Link href="/maintenance/device-management">Device management</Link>
          <Link href="/maintenance/privacy">Privacy & data</Link>
          <Link href="/reports">Reports</Link>
          <Link href="/maintenance/predictive">Predictive alerts</Link>
          </div>
        </section>
      </div>
      </div>
    </AppLayout>
  );
}
