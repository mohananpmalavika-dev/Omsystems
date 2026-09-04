"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cameraInventoryApi, provisioningApi } from "@/lib/api-client";
import { requestInstalledEdgeStart } from "@/lib/local-edge-autostart";
import type { ProvisioningRun as ProvisioningRunModel, ProvisioningStepStatus } from "@/lib/types";

const edgeActivationTimeoutMs = 15_000;

export function ProvisioningRun({
  branchId,
  refreshing = false,
  onStart,
  onInstallAgent,
  onProvideCredentials,
  onChanged,
  hasEnrolledAgent,
}: {
  branchId: string;
  refreshing?: boolean;
  onStart: () => void;
  onInstallAgent: () => void;
  onProvideCredentials: () => void;
  onChanged?: () => void;
  hasEnrolledAgent: boolean;
}) {
  const [run, setRun] = useState<ProvisioningRunModel>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const [activatingEdge, setActivatingEdge] = useState(false);
  const [runningStepId, setRunningStepId] = useState<string>();
  const [skippingCredentials, setSkippingCredentials] = useState(false);
  const [skippingStageId, setSkippingStageId] = useState<string>();

  const load = async (cancelledRef = { current: false }) => {
    try {
      const response = await provisioningApi.getLatest(branchId);
      if (cancelledRef.current) return;
      setRun(response.run);
      setError(undefined);
      return response.run;
    } catch (reason) {
      if (!cancelledRef.current) setError(reason instanceof Error ? reason.message : "Provisioning evidence is unavailable.");
    }
  };

  useEffect(() => {
    if (!branchId) {
      setRun(undefined);
      return;
    }
    const cancelledRef = { current: false };
    let timer: number | undefined;
    
    const runPoll = async () => {
      const currentRun = await load(cancelledRef);
      if (currentRun && ["queued", "running"].includes(currentRun.status) && !cancelledRef.current) {
        timer = window.setTimeout(runPoll, 2_000);
      }
    };
    void runPoll();

    return () => {
      cancelledRef.current = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [branchId, refreshing]);

  async function activateEdgeOnline() {
    setActivatingEdge(true);
    setError(undefined);
    setNotice(undefined);

    // This custom protocol is installed with the Windows edge agent. Invoke it
    // directly from the click event so the browser can ask the operator for
    // permission to start the existing scheduled task. It never downloads or
    // changes the branch enrollment.
    if (hasEnrolledAgent) requestInstalledEdgeStart();

    try {
      const res = await provisioningApi.activateEdgeOnline(branchId);
      if (res.status === "not-enrolled" || res.installRequired) {
        setNotice("No edge agent is enrolled for this branch. Use Install Branch Gateway to perform the first installation.");
        onInstallAgent();
        return;
      }
      if (res.status === "online") {
        setNotice(res.message || "The installed branch edge agent is already online.");
        await load();
        onChanged?.();
        return;
      }

      const deadline = Date.now() + edgeActivationTimeoutMs;
      while (Date.now() < deadline) {
        const gateways = await cameraInventoryApi.listGateways(branchId);
        const online = gateways.data.find((agent: any) =>
          agent.id === res.agent?.id && agent.status === "online"
        );
        if (online) {
          setNotice(`${online.name || "The installed edge agent"} started and authenticated successfully.`);
          await load();
          onChanged?.();
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }

      throw new Error("The installed KryptonVision Edge Agent did not come online. Approve the browser's Open KryptonVision Scanner prompt, then retry. Use Repair only if the installed task cannot start.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to activate Edge Agent online.");
    } finally {
      setActivatingEdge(false);
    }
  }

  async function runIndividualStep(stepId: string) {
    setRunningStepId(stepId);
    setError(undefined);
    setNotice(undefined);
    try {
      if (stepId === "edge-enrollment") {
        await activateEdgeOnline();
        return;
      }
      if (stepId === "credential-resolution") {
        onProvideCredentials();
        return;
      }
      if (stepId === "device-discovery") {
        onStart();
        return;
      }
      const res = await provisioningApi.executeStep(branchId, stepId);
      setNotice(res.message || `Step ${stepId} executed successfully.`);
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Failed to execute step ${stepId}.`);
    } finally {
      setRunningStepId(undefined);
    }
  }

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

  async function skipStage(stageId: string) {
    if (!run || !run.steps.find((stage) => stage.id === stageId)?.canSkip) return;
    setSkippingStageId(stageId);
    setError(undefined);
    try {
      const response = await provisioningApi.skipStage(branchId, run.id, stageId);
      setRun(response.run);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to skip this provisioning stage.");
    } finally {
      setSkippingStageId(undefined);
    }
  }

  if (!branchId) return null;

  const isEdgeOffline = run?.steps.some((step) => step.id === "edge-enrollment" && step.status !== "completed");
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
          {/* Starts an existing local installation and waits for a real authenticated heartbeat. */}
          {hasEnrolledAgent ? (
            <button
              className="primary-button"
              style={{ background: "#10b981", borderColor: "#059669" }}
              disabled={activatingEdge}
              onClick={() => void activateEdgeOnline()}
              title={isEdgeOffline
                ? "Bring the installed Edge Agent online immediately for this branch"
                : "Check that the installed Edge Agent is online for this branch"}
            >
              {activatingEdge ? <Loader2 className="spin" size={14} /> : <Zap size={14} />}
              <span>{activatingEdge
                ? "Enabling..."
                : isEdgeOffline
                  ? "Enable installed gateway"
                  : "Check installed gateway"}</span>
            </button>
          ) : null}

          {run?.status === "running" || run?.status === "queued" || refreshing ? (
            <button
              className="secondary-button"
              style={{ background: "rgba(239, 68, 68, 0.2)", color: "#f87171", borderColor: "#dc2626", fontWeight: 600 }}
              onClick={() => { setNotice("Provisioning stopped."); setRun((curr) => curr ? { ...curr, status: "active" } : undefined); }}
              title="Stop current provisioning run"
            >
              <Square size={13} fill="#f87171" /> Stop Provisioning
            </button>
          ) : null}
          {run?.status === "waiting_for_input" ? <button className="primary-button" onClick={onProvideCredentials}>Provide credentials</button> : null}
          {run?.canSkipCredentialResolution ? <button className="secondary-button" disabled={skippingCredentials} onClick={() => void skipUnavailableCredentials()}>{skippingCredentials ? "Skipping…" : "Skip unavailable devices"}</button> : null}
          {run?.status === "awaiting_evidence" ? <button className="primary-button" onClick={onStart} disabled={refreshing}>{refreshing ? "Checking…" : "Recheck verification"}</button> : null}
          {run?.status === "failed" || run?.status === "blocked" ? <button className="secondary-button" disabled={retrying} onClick={() => void retry()}><RefreshCw size={14}/>{retrying ? "Retrying..." : "Retry run"}</button> : null}
          {(!run || run.status === "not_started" || run.status === "active") && !refreshing ? <button className="primary-button" onClick={onStart} disabled={refreshing}>{run?.status === "active" ? "Run again" : "Start provisioning"}</button> : null}
        </div>
      </div>

      {notice ? <div className="device-message success" style={{ background: "rgba(16, 185, 129, 0.15)", borderColor: "#10b981", color: "#6ee7b7", padding: "10px 14px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}><CheckCircle2 size={16}/>{notice}</div> : null}
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
            <div>
              <strong>{step.label}</strong>
              <span>{step.evidence}</span>
            </div>
            <div className="ztp-step-state" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <small>{step.totalUnits > 1 ? `${step.completedUnits}/${step.totalUnits}` : step.status.replaceAll("_", " ")}</small>
              
              {/* Individual Item Execution Button */}
              {step.id === "edge-enrollment" && step.status !== "completed" ? (
                <button
                  className="primary-button"
                  style={{ padding: "3px 8px", fontSize: "11px", height: "auto", background: "#10b981", borderColor: "#059669", color: "#ffffff" }}
                  disabled={activatingEdge}
                  onClick={() => void activateEdgeOnline()}
                >
                  {activatingEdge ? <Loader2 className="spin" size={11} /> : <Zap size={11} />}
                  <span>Activate Online</span>
                </button>
              ) : step.status !== "completed" && step.status !== "skipped" ? (
                <button
                  className="secondary-button"
                  style={{ padding: "3px 8px", fontSize: "11px", height: "auto" }}
                  disabled={runningStepId === step.id}
                  onClick={() => void runIndividualStep(step.id)}
                  title={`Run ${step.label} individually`}
                >
                  {runningStepId === step.id ? <Loader2 className="spin" size={11} /> : <Play size={11} />}
                  <span>Run</span>
                </button>
              ) : null}

              {step.canSkip ? <button
                className="ztp-stage-skip"
                disabled={Boolean(skippingStageId)}
                onClick={() => void skipStage(step.id)}
              >{skippingStageId === step.id ? <Loader2 className="spin" size={12}/> : "Skip"}</button> : null}
            </div>
          </article>)}
        </div>
        {run.issues.length > 0 ? <div className="ztp-issues">
          {run.issues.map((issue) => <article className={issue.severity} key={`${issue.code}:${issue.resourceId}`}>
            <AlertTriangle size={15}/><div><strong>{issue.code.replaceAll("_", " ")}</strong><span>{issue.message} {issue.recommendedAction}</span></div>
          </article>)}
        </div> : null}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
          {isEdgeOffline ? (
            <button
              className="primary-button"
              style={{ background: "#10b981", borderColor: "#059669" }}
              disabled={activatingEdge}
              onClick={() => void activateEdgeOnline()}
            >
              {activatingEdge ? <Loader2 className="spin" size={14} /> : <Zap size={14} />}
              <span>Activate Edge Agent Online</span>
            </button>
          ) : null}
          {run.steps.some((step) => step.action === "install-agent") ? <button className="secondary-button" onClick={onInstallAgent}>Install Branch Gateway</button> : null}
        </div>
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
