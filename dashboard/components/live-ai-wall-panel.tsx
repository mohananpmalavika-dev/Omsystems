"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Check,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { analyticsApi } from "@/lib/api-client";
import type { AiCapabilityDomain, AiEngineState } from "@/hooks/use-live-ai-wall";
import type { AnalyticsAlert, AnalyticsRule, Camera } from "@/lib/types";

type AlertAction = "acknowledge" | "investigating" | "incident" | "resolved";

export function LiveAiWallPanel({
  cameras,
  rules,
  alerts,
  engineState,
  capabilityDomains,
  capabilityCount,
  selectedCameraId,
  loading,
  error,
  lastUpdatedAt,
  onSelectCamera,
  onClose,
  onRefresh,
}: {
  cameras: Camera[];
  rules: AnalyticsRule[];
  alerts: AnalyticsAlert[];
  engineState: AiEngineState;
  capabilityDomains: AiCapabilityDomain[];
  capabilityCount: number;
  selectedCameraId?: string;
  loading: boolean;
  error?: string;
  lastUpdatedAt?: string;
  onSelectCamera: (cameraId?: string) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] = useState<any>();
  const [assistantLoading, setAssistantLoading] = useState(false);

  const cameraById = useMemo(() => new Map(cameras.map((camera) => [camera.id, camera])), [cameras]);
  const visibleRules = useMemo(
    () => selectedCameraId ? rules.filter((rule) => rule.cameraId === selectedCameraId) : rules,
    [rules, selectedCameraId],
  );
  const visibleAlerts = useMemo(
    () => alerts
      .filter((alert) => !selectedCameraId || alert.cameraId === selectedCameraId)
      .filter((alert) => !["resolved", "false_alarm", "suppressed"].includes(alert.status)),
    [alerts, selectedCameraId],
  );
  const enabledRuleCount = visibleRules.filter((rule) => rule.enabled).length;

  const mutateAlert = async (alert: AnalyticsAlert, action: AlertAction) => {
    setBusyId(alert.id);
    setMessage(undefined);
    try {
      if (action === "acknowledge") {
        await analyticsApi.acknowledge(alert.id, "Acknowledged from live video wall");
      } else if (action === "incident") {
        await analyticsApi.createIncident(alert.id, { notes: "Created from live AI video wall" });
      } else {
        await analyticsApi.updateAlert(alert.id, { status: action });
      }
      await onRefresh();
      setMessage({
        kind: "success",
        text: action === "incident" ? "Incident created and evidence protected." : `Alert marked ${action}.`,
      });
    } catch (reason) {
      setMessage({ kind: "error", text: readable(reason) });
    } finally {
      setBusyId(undefined);
    }
  };

  const toggleRule = async (rule: AnalyticsRule) => {
    setBusyId(rule.id);
    setMessage(undefined);
    try {
      await analyticsApi.updateRule(rule.cameraId, rule.id, { enabled: !rule.enabled });
      await onRefresh();
      setMessage({ kind: "success", text: `${rule.name} ${rule.enabled ? "disabled" : "enabled"}.` });
    } catch (reason) {
      setMessage({ kind: "error", text: readable(reason) });
    } finally {
      setBusyId(undefined);
    }
  };

  const askAssistant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (assistantQuery.trim().length < 3) return;
    setAssistantLoading(true);
    setMessage(undefined);
    try {
      setAssistantResult(await analyticsApi.askAssistant(assistantQuery.trim()));
    } catch (reason) {
      setMessage({ kind: "error", text: readable(reason) });
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="live-ai-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <aside className="live-ai-panel" role="dialog" aria-modal="true" aria-label="Live AI intelligence">
        <header className="live-ai-header">
          <div>
            <span className="live-ai-eyebrow"><BrainCircuit size={13} /> Live intelligence</span>
            <h2>AI video operations</h2>
            <p>Real rules, detections, and operator actions for cameras on this wall.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close live AI panel"><X size={18} /></button>
        </header>

        <div className="live-ai-engine-row">
          <span className={`live-ai-engine ${engineState}`}><i /> AI engine {engineState}</span>
          <span>{capabilityCount} capabilities</span>
          <button type="button" onClick={() => void onRefresh()} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {message && <div className={`live-ai-message ${message.kind}`}>{message.text}</div>}
        {error && <div className="live-ai-message error">{error}. Existing video streams remain available.</div>}

        <label className="live-ai-camera-scope">
          Camera scope
          <select value={selectedCameraId ?? ""} onChange={(event) => onSelectCamera(event.target.value || undefined)}>
            <option value="">All cameras on wall</option>
            {cameras.slice(0, 144).map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.name} · {camera.branchName}</option>
            ))}
          </select>
        </label>

        <section className="live-ai-metrics">
          <article><strong>{enabledRuleCount}</strong><span>Rules active</span></article>
          <article><strong>{visibleAlerts.length}</strong><span>Open detections</span></article>
          <article><strong>{visibleAlerts.filter((alert) => alert.severity === "P1").length}</strong><span>Critical P1</span></article>
        </section>

        <form className="live-ai-assistant" onSubmit={(event) => void askAssistant(event)}>
          <Sparkles size={16} />
          <input
            value={assistantQuery}
            onChange={(event) => setAssistantQuery(event.target.value)}
            placeholder="Ask: show smoke alerts or cameras not recording"
          />
          <button disabled={assistantLoading || assistantQuery.trim().length < 3}>
            {assistantLoading ? "Checking…" : "Ask"}
          </button>
        </form>
        {assistantResult && (
          <div className="live-ai-answer">
            <strong>{assistantResult.answer}</strong>
            {assistantResult.actions?.map((action: any) => (
              <Link key={`${action.href}-${action.label}`} href={action.href}>{action.label} <ExternalLink size={11} /></Link>
            ))}
          </div>
        )}

        <section className="live-ai-section">
          <div className="live-ai-section-title">
            <div><span>Detection queue</span><h3>Live AI alerts</h3></div>
            <Link href="/analytics">Full console <ExternalLink size={11} /></Link>
          </div>
          {visibleAlerts.length === 0 ? (
            <div className="live-ai-empty"><ShieldCheck size={22} /><strong>No open detections</strong><span>Enabled rules are monitoring this scope.</span></div>
          ) : (
            <div className="live-ai-list">
              {visibleAlerts.slice(0, 30).map((alert) => (
                <article className={`live-ai-alert ${alert.severity.toLowerCase()}`} key={alert.id}>
                  <div className="live-ai-alert-title">
                    <span>{alert.severity}</span>
                    <div><strong>{alert.title}</strong><small>{cameraById.get(alert.cameraId)?.name ?? alert.cameraId}</small></div>
                    <b>{Math.round(alert.confidence * 100)}%</b>
                  </div>
                  <p>{new Date(alert.lastDetectedAt).toLocaleString()} · {alert.status.replaceAll("_", " ")}</p>
                  <div className="live-ai-alert-actions">
                    {alert.status === "new" && <button disabled={busyId === alert.id} onClick={() => void mutateAlert(alert, "acknowledge")}><Check size={11} /> Ack</button>}
                    <button disabled={busyId === alert.id} onClick={() => void mutateAlert(alert, "investigating")}><Activity size={11} /> Investigate</button>
                    {!alert.incidentId && <button disabled={busyId === alert.id} onClick={() => void mutateAlert(alert, "incident")}><ShieldAlert size={11} /> Incident</button>}
                    <button disabled={busyId === alert.id} onClick={() => void mutateAlert(alert, "resolved")}><ShieldCheck size={11} /> Resolve</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="live-ai-section">
          <div className="live-ai-section-title"><div><span>Camera policy</span><h3>Analytics rules</h3></div></div>
          {visibleRules.length === 0 ? (
            <div className="live-ai-empty"><BrainCircuit size={22} /><strong>No rules in this scope</strong><span>Configure camera AI in the analytics console.</span></div>
          ) : (
            <div className="live-ai-rule-grid">
              {visibleRules.slice(0, 60).map((rule) => (
                <button type="button" key={rule.id} disabled={busyId === rule.id} onClick={() => void toggleRule(rule)} className={rule.enabled ? "enabled" : ""}>
                  <i />
                  <span><strong>{rule.name}</strong><small>{rule.detectionType} · {Math.round(rule.minConfidence * 100)}%</small></span>
                  <b>{rule.enabled ? "ON" : "OFF"}</b>
                </button>
              ))}
            </div>
          )}
        </section>

        {capabilityDomains.length > 0 && (
          <section className="live-ai-section">
            <div className="live-ai-section-title"><div><span>Available models</span><h3>AI capability catalog</h3></div></div>
            <div className="live-ai-domain-list">
              {capabilityDomains.map((domain) => (
                <details key={domain.id}>
                  <summary><span><strong>{domain.name}</strong><small>{domain.description}</small></span><b>{domain.capabilities.length}</b></summary>
                  <div>{domain.capabilities.map((capability) => <span key={capability.id} title={capability.description}>{capability.name}</span>)}</div>
                </details>
              ))}
            </div>
          </section>
        )}

        <footer className="live-ai-footer">
          <span>{lastUpdatedAt ? `Synced ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "Waiting for analytics telemetry"}</span>
          <div><Link href="/analytics/face-recognition">Face</Link><Link href="/analytics/anpr">ANPR</Link><Link href="/analytics/people">People</Link><Link href="/analytics/vehicles">Vehicles</Link><Link href="/analytics/banking">Banking</Link><Link href="/analytics/industrial">Safety</Link></div>
        </footer>
      </aside>

      <style jsx>{`
        .live-ai-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; justify-content: flex-end; background: rgba(2,6,23,.58); backdrop-filter: blur(2px); }
        .live-ai-panel { width: min(520px, 100vw); height: 100dvh; overflow-y: auto; color: #e2e8f0; border-left: 1px solid #334155; background: #09111f; box-shadow: -24px 0 70px rgba(0,0,0,.4); }
        .live-ai-header { position: sticky; top: 0; z-index: 3; display: flex; justify-content: space-between; gap: 14px; padding: 19px 20px; border-bottom: 1px solid #243247; background: rgba(9,17,31,.96); backdrop-filter: blur(12px); }
        .live-ai-header h2 { margin: 3px 0; color: #fff; font-size: 20px; }.live-ai-header p { margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.45; }
        .live-ai-header > button { width: 34px; height: 34px; display: grid; place-items: center; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; background: #111c2e; }
        .live-ai-eyebrow { display: inline-flex; align-items: center; gap: 5px; color: #22d3ee; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .live-ai-engine-row { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 10px; }
        .live-ai-engine-row > span:nth-child(2) { margin-left: auto; }.live-ai-engine-row button { display: inline-flex; align-items: center; gap: 4px; color: #bae6fd; border: 1px solid #334155; border-radius: 6px; background: #132037; padding: 5px 8px; }
        .live-ai-engine { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; text-transform: capitalize; }.live-ai-engine i { width: 7px; height: 7px; border-radius: 50%; background: #64748b; }.live-ai-engine.online i { background: #22c55e; box-shadow: 0 0 7px #22c55e; }.live-ai-engine.degraded i { background: #f59e0b; }.live-ai-engine.offline i, .live-ai-engine.unavailable i { background: #ef4444; }
        .live-ai-message { margin: 10px 20px 0; padding: 8px 10px; border: 1px solid #166534; border-radius: 7px; color: #bbf7d0; background: #052e16; font-size: 11px; }.live-ai-message.error { color: #fecaca; border-color: #7f1d1d; background: #3f0a0a; }
        .live-ai-camera-scope { display: grid; gap: 6px; padding: 14px 20px 0; color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }.live-ai-camera-scope select { min-height: 38px; padding: 0 10px; color: #e2e8f0; border: 1px solid #334155; border-radius: 8px; background: #101b2d; font-size: 12px; text-transform: none; }
        .live-ai-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; padding: 12px 20px; }.live-ai-metrics article { padding: 10px; border: 1px solid #26364d; border-radius: 9px; background: #101b2d; }.live-ai-metrics strong,.live-ai-metrics span { display: block; }.live-ai-metrics strong { color: #f8fafc; font-size: 18px; }.live-ai-metrics span { margin-top: 2px; color: #94a3b8; font-size: 9px; }
        .live-ai-assistant { margin: 0 20px; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 8px 9px; color: #a5b4fc; border: 1px solid #3730a3; border-radius: 9px; background: #16163b; }.live-ai-assistant input { min-width: 0; color: #fff; border: 0; outline: 0; background: transparent; font-size: 11px; }.live-ai-assistant button { padding: 6px 9px; color: #fff; border: 0; border-radius: 6px; background: #4f46e5; font-size: 10px; font-weight: 800; }.live-ai-assistant button:disabled { opacity: .5; }
        .live-ai-answer { margin: 8px 20px 0; padding: 9px 10px; display: flex; align-items: center; gap: 8px; border: 1px solid #334155; border-radius: 8px; background: #101b2d; font-size: 10px; }.live-ai-answer strong { flex: 1; }.live-ai-answer a { display: inline-flex; align-items: center; gap: 4px; color: #7dd3fc; }
        .live-ai-section { padding: 17px 20px 0; }.live-ai-section-title { display: flex; align-items: end; justify-content: space-between; margin-bottom: 9px; }.live-ai-section-title span { color: #22d3ee; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }.live-ai-section-title h3 { margin: 2px 0 0; color: #f8fafc; font-size: 14px; }.live-ai-section-title > a { display: inline-flex; align-items: center; gap: 4px; color: #7dd3fc; font-size: 10px; }
        .live-ai-list { display: grid; gap: 7px; }.live-ai-alert { padding: 10px; border: 1px solid #334155; border-left: 3px solid #64748b; border-radius: 8px; background: #101b2d; }.live-ai-alert.p1 { border-left-color: #ef4444; }.live-ai-alert.p2 { border-left-color: #f59e0b; }.live-ai-alert-title { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 7px; }.live-ai-alert-title > span { padding: 2px 5px; color: #fff; border-radius: 4px; background: #dc2626; font-size: 8px; font-weight: 800; }.live-ai-alert-title strong,.live-ai-alert-title small { display: block; }.live-ai-alert-title strong { color: #fff; font-size: 11px; }.live-ai-alert-title small { margin-top: 2px; color: #94a3b8; font-size: 9px; }.live-ai-alert-title > b { color: #fde68a; font-size: 11px; }.live-ai-alert > p { margin: 7px 0; color: #64748b; font-size: 9px; }
        .live-ai-alert-actions { display: flex; flex-wrap: wrap; gap: 5px; }.live-ai-alert-actions button { display: inline-flex; align-items: center; gap: 3px; padding: 4px 6px; color: #cbd5e1; border: 1px solid #334155; border-radius: 5px; background: #17243a; font-size: 9px; }.live-ai-alert-actions button:hover { color: #fff; border-color: #38bdf8; }.live-ai-alert-actions button:disabled { opacity: .5; }
        .live-ai-empty { min-height: 92px; display: grid; place-content: center; justify-items: center; gap: 4px; color: #64748b; border: 1px dashed #334155; border-radius: 9px; text-align: center; }.live-ai-empty strong { color: #cbd5e1; font-size: 11px; }.live-ai-empty span { font-size: 9px; }
        .live-ai-rule-grid { display: grid; gap: 5px; }.live-ai-rule-grid > button { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 8px 9px; color: #94a3b8; border: 1px solid #27364c; border-radius: 7px; background: #0e1929; text-align: left; }.live-ai-rule-grid > button > i { width: 8px; height: 8px; border-radius: 50%; background: #475569; }.live-ai-rule-grid > button.enabled > i { background: #22c55e; box-shadow: 0 0 6px #22c55e; }.live-ai-rule-grid strong,.live-ai-rule-grid small { display: block; }.live-ai-rule-grid strong { color: #e2e8f0; font-size: 10px; }.live-ai-rule-grid small { margin-top: 2px; color: #64748b; font-size: 8px; }.live-ai-rule-grid b { color: #64748b; font-size: 8px; }.live-ai-rule-grid .enabled b { color: #86efac; }
        .live-ai-domain-list { display: grid; gap: 5px; }.live-ai-domain-list details { border: 1px solid #27364c; border-radius: 8px; background: #0e1929; }.live-ai-domain-list summary { display: flex; align-items: center; justify-content: space-between; padding: 9px 10px; cursor: pointer; list-style: none; }.live-ai-domain-list summary strong,.live-ai-domain-list summary small { display: block; }.live-ai-domain-list summary strong { color: #e2e8f0; font-size: 10px; }.live-ai-domain-list summary small { margin-top: 2px; color: #64748b; font-size: 8px; }.live-ai-domain-list summary b { color: #22d3ee; font-size: 10px; }.live-ai-domain-list details > div { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 9px 9px; }.live-ai-domain-list details > div span { padding: 3px 6px; color: #bae6fd; border: 1px solid #164e63; border-radius: 999px; background: #083344; font-size: 8px; }
        .live-ai-footer { padding: 18px 20px 28px; display: grid; gap: 9px; color: #64748b; font-size: 9px; }.live-ai-footer div { display: flex; flex-wrap: wrap; gap: 6px; }.live-ai-footer a { color: #7dd3fc; }
        .spin { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 560px) { .live-ai-panel { width: 100vw; border-left: 0; }.live-ai-header { padding: 16px; }.live-ai-engine-row,.live-ai-camera-scope,.live-ai-section { padding-inline: 16px; }.live-ai-metrics { padding-inline: 16px; }.live-ai-assistant,.live-ai-answer { margin-inline: 16px; } }
      `}</style>
    </div>
  );
}

function readable(reason: unknown) {
  return reason instanceof Error ? reason.message : "The AI operation failed.";
}
