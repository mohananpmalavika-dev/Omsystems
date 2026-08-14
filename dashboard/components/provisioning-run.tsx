"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { provisioningApi } from "@/lib/api-client";
import type { ProvisioningRun as ProvisioningRunModel, ProvisioningStepStatus } from "@/lib/types";

export function ProvisioningRun({
  branchId,
  refreshing = false,
  onStart,
  onInstallAgent,
  onProvideCredentials,
  onChanged,
}: {
  branchId: string;
  refreshing?: boolean;
  onStart: () => void;
  onInstallAgent: () => void;
  onProvideCredentials: () => void;
  onChanged?: () => void;
}) {
  const [run, setRun] = useState<ProvisioningRunModel>();
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const [skippingCredentials, setSkippingCredentials] = useState(false);

  useEffect(() => {
    if (!branchId) {
      setRun(undefined);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await provisioningApi.getLatest(branchId);
        if (cancelled) return;
        setRun(response.run);
        setError(undefined);
        if (["queued", "running"].includes(response.run.status)) {
          timer = window.setTimeout(load, 2_000);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Provisioning evidence is unavailable.");
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [branchId, refreshing]);

  async function retry() {
    if (!run || run.status !== "failed" && run.status !== "blocked" && run.status !== "waiting_for_input") return;
    setRetrying(true);
    setError(undefined);
    try {
      const response = await provisioningApi.retry(branchId, run.id);
      setRun(response.run);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to retry provisioning.");
    } finally {
      setRetrying(false);
    }
  }

  async function skipUnavailableCredentials() {
    if (!run || !run.canSkipCredentialResolution) return;
    setSkippingCredentials(true);
    setError(undefined);
    try {
      const response = await provisioningApi.skipCredentials(branchId, run.id);
      setRun(response.run);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to defer the unavailable device credentials.");
    } finally {
      setSkippingCredentials(false);
    }
  }

  if (!branchId) return null;

  const headline = run?.status === "active" ? "Branch evidence verified"
    : run?.status === "waiting_for_input" ? "Operator input required"
      : run?.status === "awaiting_evidence" ? "Automatic scan complete"
      : run?.status === "blocked" ? "Activation blocked"
        : run?.status === "failed" ? "Provisioning failed"
          : run?.status === "running" || run?.status === "queued" ? "Provisioning in progress"
            : "Ready for zero-touch provisioning";

  return (
    <section className="ztp-panel" aria-live="polite">
      <div className="ztp-header">
        <div className="ztp-title">
          <span className={`ztp-mark ${run?.status ?? "not_started"}`}><ShieldCheck size={21}/></span>
          <div>
            <h3>{headline}</h3>
            <p>{run?.currentStage ?? "Enroll an edge agent, discover the CCTV estate, and activate only from real evidence."}</p>
          </div>
        </div>
        <div className="ztp-actions">
          {run?.status === "waiting_for_input" ? <button className="primary-button" onClick={onProvideCredentials}>Provide credentials</button> : null}
          {run?.canSkipCredentialResolution ? <button className="secondary-button" disabled={skippingCredentials} onClick={() => void skipUnavailableCredentials()}>{skippingCredentials ? "Skipping…" : "Skip unavailable devices"}</button> : null}
          {run?.status === "awaiting_evidence" ? <button className="primary-button" onClick={onStart} disabled={refreshing}>{refreshing ? "Checking…" : "Recheck verification"}</button> : null}
          {run?.status === "failed" || run?.status === "blocked" ? <button className="secondary-button" disabled={retrying} onClick={() => void retry()}><RefreshCw size={14}/>{retrying ? "Retrying..." : "Retry run"}</button> : null}
          {!run || run.status === "not_started" || run.status === "active" ? <button className="primary-button" onClick={onStart} disabled={refreshing}>{refreshing ? "Starting..." : run?.status === "active" ? "Run again" : "Start provisioning"}</button> : null}
        </div>
      </div>

      {error ? <div className="device-message error"><AlertTriangle size={15}/>{error}</div> : null}

      {run?.canSkipCredentialResolution ? <p className="ztp-skip-note">A verified camera is already available. Skipping keeps the remaining devices pending and asks for their credentials again in a future scan.</p> : null}
      {run?.status === "awaiting_evidence" ? <p className="ztp-skip-note">The automatic scan has finished—no RTSP check is still running. This stage updates when the Branch Gateway reports new video evidence or you choose Recheck verification.</p> : null}

      {run ? <>
        <div className="ztp-progress-copy"><span>{run.completedUnits} of {run.totalUnits} evidence units complete</span><strong>{run.progressPercent.toFixed(1)}%</strong></div>
        <div className="ztp-progress"><span style={{ width: `${run.progressPercent}%` }}/></div>
        <div className="ztp-summary">
          <Metric label="Discovered" value={run.summary.discoveredDevices}/>
          <Metric label="Recorders" value={run.summary.recorders}/>
          <Metric label="Imported" value={run.summary.importedChannels}/>
          <Metric label="Streams" value={run.summary.verifiedStreams}/>
          <Metric label="Recordings" value={run.summary.recordingsVerified}/>
          <Metric label="AI assigned" value={run.summary.analyticsAssigned}/>
        </div>
        <div className="ztp-steps">
          {run.steps.map((step) => <article className={`ztp-step ${step.status}`} key={step.id}>
            <StepIcon status={step.status}/>
            <div><strong>{step.label}</strong><span>{step.evidence}</span></div>
            <small>{step.totalUnits > 1 ? `${step.completedUnits}/${step.totalUnits}` : step.status.replaceAll("_", " ")}</small>
          </article>)}
        </div>
        {run.issues.length > 0 ? <div className="ztp-issues">
          {run.issues.map((issue) => <article className={issue.severity} key={`${issue.code}:${issue.resourceId}`}>
            <AlertTriangle size={15}/><div><strong>{issue.code.replaceAll("_", " ")}</strong><span>{issue.message} {issue.recommendedAction}</span></div>
          </article>)}
        </div> : null}
        {run.steps.some((step) => step.action === "install-agent") ? <button className="secondary-button" onClick={onInstallAgent}>Install Branch Gateway</button> : null}
      </> : <div className="ztp-empty"><Clock3 size={18}/><span>No provisioning run has started for this branch.</span></div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function StepIcon({ status }: { status: ProvisioningStepStatus }) {
  if (status === "completed") return <CheckCircle2 size={17}/>;
  if (status === "running") return <Loader2 className="spin" size={17}/>;
  if (status === "failed" || status === "blocked") return <XCircle size={17}/>;
  if (status === "warning") return <AlertTriangle size={17}/>;
  return <Circle size={17}/>;
}
