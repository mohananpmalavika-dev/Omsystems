"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ClipboardCheck, Wrench } from "lucide-react";
import { maintenanceApi, deviceManagementApi } from "@/lib/api-client";
import { WorkflowNav } from "@/components/workflow-nav";
import { MaintenanceTaskDesk, type MaintenanceTask } from "@/components/maintenance/task-desk";

export default function MaintenancePage() {
  const [workspace, setWorkspace] = useState("attention");
  const [status, setStatus] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [firmwareUpdates, setFirmwareUpdates] = useState<any[]>([]);
  const [firmwareCatalog, setFirmwareCatalog] = useState<any[]>([]);
  const [lowStockParts, setLowStockParts] = useState<any[]>([]);
  const [highRiskAssets, setHighRiskAssets] = useState<any[]>([]);
  const [pendingRotations, setPendingRotations] = useState<number>(0);
  const [ipConflictCount, setIpConflictCount] = useState<number>(0);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

    void Promise.allSettled([
      maintenanceApi.getDashboardStatus(),
      maintenanceApi.getDashboardHealth(),
      maintenanceApi.listFirmwareUpdatesRequired(),
      maintenanceApi.listFirmwareCatalog(),
      maintenanceApi.listLowStockParts(),
      maintenanceApi.listHighRiskAssets(),
      maintenanceApi.getMaintenanceMetrics(),
      deviceManagementApi.listPasswordRotations(),
      deviceManagementApi.getIpConflicts(),
    ])
      .then((results) => {
        const setters = [
          (data:any)=>setStatus(data), (data:any)=>setHealth(data),
          (data:any)=>setFirmwareUpdates(data.data??[]), (data:any)=>setFirmwareCatalog(data.data??[]),
          (data:any)=>setLowStockParts(data.data??[]), (data:any)=>setHighRiskAssets(data.data??[]),
          (data:any)=>setCompliance(data??null),
          (data:any)=>setPendingRotations((data.data??[]).filter((item:any)=>item.status!=="completed").length),
          (data:any)=>setIpConflictCount((data.data??[]).length),
        ];
        results.forEach((result,index)=>{if(result.status==="fulfilled")setters[index]!(result.value);});
        const missing=results.filter(result=>result.status==="rejected").length;
        if(missing)setError(`${missing} maintenance feeds are unavailable. Available tasks are still shown.`);
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

  const tasks:MaintenanceTask[] = [
    ...(status?.predictiveAlerts??[]).filter((item:any)=>item.status==="open").map((item:any)=>({id:`alert-${item.id}`,kind:"Alert" as const,title:item.alertType||item.type||"Predictive alert",description:item.details?.summary||item.details?.message||`Risk score ${item.score??"unavailable"}`,priority:item.score>0.8?"critical":item.score>0.5?"high":"medium",reference:item.id,assetId:item.assetId,status:item.status,href:"/maintenance/predictive",actionLabel:"Inspect predictive alert"})),
    ...highRiskAssets.map((item:any)=>({id:`risk-${item.id}`,kind:"Asset risk" as const,title:item.deviceType||item.assetId||"Asset risk",description:item.details?.summary||item.details?.message||`Risk score ${item.score??"unavailable"}`,priority:item.score>0.8?"critical":"high",reference:item.id,assetId:item.assetId,href:item.assetId?`/maintenance/assets/${encodeURIComponent(item.assetId)}`:"/maintenance/predictive",actionLabel:"Inspect affected asset"})),
    ...(status?.workOrders??[]).filter((item:any)=>!["resolved","closed","cancelled"].includes(item.status)).map((item:any)=>({id:`work-${item.id}`,kind:"Work order" as const,title:item.problem||item.title||"Service task",description:item.actionTaken||item.rootCause||"Review this order and coordinate the next service action.",priority:item.severity||"medium",reference:item.workOrderNumber||item.id,assetId:item.assetId,status:item.status,owner:item.technician||item.assignedTo,dueAt:item.slaDueAt,href:`/maintenance/workorders/${encodeURIComponent(item.id)}`,actionLabel:"Open service order"})),
  ].sort((a,b)=>["critical","high","medium","low"].indexOf(a.priority)-["critical","high","medium","low"].indexOf(b.priority));

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
    <main className="content maintenance-dashboard-page maintenance-action-workspace">
      <div className="maintenance-page-inner">
        <header className="workflow-heading maintenance-desk-heading"><div><p className="workflow-kicker">SERVICE DESK / FLEET READINESS</p><h1>Keep the fleet<br/><em>moving forward.</em></h1><p>Pick the next issue. Understand it. Take action.</p></div><div className="workflow-heading-actions"><Link href="/maintenance/health" className="btn-secondary"><Activity size={16}/>Run health checks</Link><Link href="/maintenance/workorders/new" className="btn-primary"><ClipboardCheck size={16}/>New work order</Link></div></header>
        <WorkflowNav label="Maintenance workspace" value={workspace} onChange={setWorkspace} items={[{id:"attention",label:"Attention queue"},{id:"health",label:"Fleet pulse"},{id:"firmware",label:"Firmware lab"},{id:"inventory",label:"Parts & coverage"}]} />
        {error&&<div className="module-alert" role="alert">{error}</div>}
        <section hidden={workspace!=="attention"}><MaintenanceTaskDesk tasks={tasks} loading={loading} unavailable={Boolean(error)}/></section>
        <section hidden={workspace!=="health"} className="fleet-pulse-workspace">
          <div className="fleet-pulse-feature"><p className="workflow-kicker">CURRENT HEALTH</p><strong>{loading?"…":health?.healthPercentage!=null?`${health.healthPercentage}%`:"—"}</strong><h2>Fleet health score</h2><p>{health?"From the latest maintenance health feed.":"Waiting for an available health feed."}</p><Link className="btn-secondary" href="/maintenance/health">Open diagnostics</Link></div>
          <div className="fleet-pulse-measures">{[["Tracked assets",status?.totalAssets],["Open work orders",status?.workOrdersOpen],["Overdue visits",health?.overdueVisits],["Active AMC contracts",status?.amcContractsActive],["Maintenance visits pending",status?.visitsPending],["AMCs expiring soon",status?.amcContractsExpiring]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{loading?"…":value??"—"}</strong></div>)}</div>
          <div className="fleet-device-actions"><h2>Device operations</h2><p>Handle rotation, configuration and address assignments.</p><Link href="/maintenance/device-management" className="btn-primary">Open device management</Link><Link href="/maintenance/camera-map" className="btn-secondary">Explore camera locations</Link></div>
        </section>
        <section hidden={workspace!=="firmware"} className="firmware-lab-workspace">
          <div className="firmware-lab-context"><p className="workflow-kicker">ROLLOUT / PLAN BEFORE DEPLOYMENT</p><h2>Firmware lab</h2><p>Inspect the update requirement, then prepare a rollout with the safety checks below.</p><div className="firmware-readiness-list"><h3>Devices requiring updates</h3>{firmwareUpdates.map(item=><div key={item.id}><strong>{item.deviceType||item.id}</strong><span>{item.currentVersion} → {item.latestVersion??"Unknown"}</span></div>)}{!firmwareUpdates.length&&<p>{loading?"Loading…":error?"Update feed unavailable or empty.":"No devices currently require updates."}</p>}</div><div className="firmware-readiness-list"><h3>Registered packages</h3>{firmwareCatalog.map(item=><button key={item.id} type="button" aria-pressed={upgradePayload.firmwareVersionId===item.id} onClick={()=>setUpgradePayload(previous=>({...previous,firmwareVersionId:item.id}))}><strong>{item.vendor} {item.model}</strong><span>{item.version} / {item.status}</span></button>)}{!firmwareCatalog.length&&<p>{loading?"Loading…":"No registered packages available in the current feed."}</p>}</div></div>
          <div className="firmware-plan-surface">      <section style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", marginBottom: 24 }}>
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
                    checked={key === "activeIncidentsPresent" ? !upgradePayload.safetyContext[key] : upgradePayload.safetyContext[key]}
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
      </section></div>
        </section>
        <section hidden={workspace!=="inventory"} className="parts-coverage-workspace"><div><p className="workflow-kicker">PARTS / REPLENISHMENT</p><h2>Stock watch</h2><p>Parts below the reorder threshold.</p>{lowStockParts.map(part=><article key={part.id}><strong>{part.partName}</strong><span>Quantity {part.quantity} / Reorder {part.reorderLevel}</span></article>)}{!lowStockParts.length&&<p>{loading?"Loading parts…":error?"Stock feed unavailable or empty.":"No parts are below the reorder threshold."}</p>}<Link href="/maintenance/assets" className="btn-secondary">Browse hardware assets</Link></div><aside><p className="workflow-kicker">SERVICE NETWORK</p><h2>Coverage & partners</h2><Link href="/maintenance/amc">AMC contracts<span>{status?.amcContractsActive??"—"}</span></Link><Link href="/maintenance/vendors">Vendor directory<Wrench size={16}/></Link><Link href="/maintenance/workorders">Service work orders<ClipboardCheck size={16}/></Link><Link href="/maintenance/privacy">Privacy & data<Activity size={16}/></Link></aside></section>
      </div>
    </main>
  );
}
