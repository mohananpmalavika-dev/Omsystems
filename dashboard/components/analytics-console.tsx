"use client";

import {
  Activity, AlertTriangle, ArrowLeft, BellRing, BrainCircuit, Camera,
  Check, ChevronRight, CircleDot, Clock3, ExternalLink, Plus, RefreshCw,
  Save, ShieldAlert, ShieldCheck, Siren, Trash2, UsersRound, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { analyticsApi, cameraInventoryApi } from "@/lib/api-client";
import type {
  AnalyticsAlert, AnalyticsAlertStatus, AnalyticsAlertSummary,
  AnalyticsDetectionType, AnalyticsRule, AnalyticsSeverity, Branch,
  Camera as CameraType,
} from "@/lib/types";

const detectionOptions: Array<{ value: AnalyticsDetectionType; label: string }> = [
  { value: "person", label: "Person detection" },
  { value: "vehicle", label: "Vehicle detection" },
  { value: "motion", label: "Motion" },
  { value: "object", label: "Object detection" },
  { value: "line-crossing", label: "Line crossing" },
  { value: "intrusion", label: "Polygon intrusion" },
  { value: "loitering", label: "Loitering" },
  { value: "crowd-density", label: "Crowd density" },
  { value: "camera-tampering", label: "Camera tampering" },
  { value: "video-loss", label: "Video loss" },
  { value: "fire-smoke", label: "Fire / smoke" },
];

const emptySummary: AnalyticsAlertSummary = {
  total: 0, open: 0, new: 0, critical: 0, highPriority: 0,
};

export function AnalyticsConsole() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [rules, setRules] = useState<AnalyticsRule[]>([]);
  const [alerts, setAlerts] = useState<AnalyticsAlert[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [statusFilter, setStatusFilter] = useState<AnalyticsAlertStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const [showRuleForm, setShowRuleForm] = useState(false);

  const refreshAlerts = useCallback(async () => {
    if (!branchId) return;
    const response = await analyticsApi.listAlerts({
      branchId, status: statusFilter || undefined, limit: 100,
    });
    setAlerts(response.data as AnalyticsAlert[]);
    setSummary(response.summary as AnalyticsAlertSummary);
  }, [branchId, statusFilter]);

  const refreshRules = useCallback(async () => {
    if (!cameraId) {
      setRules([]);
      return;
    }
    const response = await analyticsApi.listRules(cameraId);
    setRules(response.data as AnalyticsRule[]);
  }, [cameraId]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        setBranches(data as Branch[]);
        setBranchId(data[0]?.id ?? "");
      })
      .catch((error) => setMessage({ kind: "error", text: readable(error) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    setCameraId("");
    void Promise.all([
      cameraInventoryApi.listByBranch(branchId, "analytics:view"),
      analyticsApi.listAlerts({ branchId, status: statusFilter || undefined, limit: 100 }),
    ]).then(([cameraResponse, alertResponse]) => {
      const nextCameras = cameraResponse.data as CameraType[];
      setCameras(nextCameras);
      setCameraId(nextCameras[0]?.id ?? "");
      setAlerts(alertResponse.data as AnalyticsAlert[]);
      setSummary(alertResponse.summary as AnalyticsAlertSummary);
    }).catch((error) => setMessage({ kind: "error", text: readable(error) }))
      .finally(() => setLoading(false));
  }, [branchId, statusFilter]);

  useEffect(() => {
    void refreshRules().catch((error) =>
      setMessage({ kind: "error", text: readable(error) })
    );
  }, [refreshRules]);

  const cameraById = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera])),
    [cameras],
  );
  const activeCamera = cameraById.get(cameraId);

  const mutateAlert = useCallback(async (
    alert: AnalyticsAlert,
    action: "acknowledge" | "investigating" | "escalate" | "resolved" | "false_alarm" | "incident",
  ) => {
    setSaving(true);
    setMessage(undefined);
    try {
      if (action === "acknowledge") {
        await analyticsApi.acknowledge(alert.id, "Acknowledged from the analytics console");
      } else if (action === "escalate") {
        await analyticsApi.escalate(alert.id, { notes: "Escalated by the security operator" });
      } else if (action === "incident") {
        await analyticsApi.createIncident(alert.id);
      } else if (action === "false_alarm") {
        const reason = window.prompt("Why is this a false alarm?");
        if (!reason) return;
        await analyticsApi.updateAlert(alert.id, { status: action, falseAlarmReason: reason });
      } else {
        await analyticsApi.updateAlert(alert.id, { status: action });
      }
      await refreshAlerts();
      setMessage({
        kind: "success",
        text: action === "incident"
          ? "Incident created and the recording window is protected."
          : `Alert changed to ${action.replaceAll("_", " ")}.`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSaving(false);
    }
  }, [refreshAlerts]);

  const toggleRule = useCallback(async (rule: AnalyticsRule) => {
    setSaving(true);
    try {
      await analyticsApi.updateRule(rule.cameraId, rule.id, { enabled: !rule.enabled });
      await refreshRules();
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSaving(false);
    }
  }, [refreshRules]);

  const deleteRule = useCallback(async (rule: AnalyticsRule) => {
    if (!window.confirm(`Delete analytics rule \"${rule.name}\"?`)) return;
    setSaving(true);
    try {
      await analyticsApi.deleteRule(rule.cameraId, rule.id);
      await refreshRules();
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSaving(false);
    }
  }, [refreshRules]);

  return (
    <>
      <header className="analytics-header">
        <div>
          <a href="/" className="admin-back"><ArrowLeft size={15} /> Security operations</a>
          <div className="analytics-title">
            <span><BrainCircuit size={23} /></span>
            <div>
              <h1>Video Analytics & AI</h1>
              <p>Detection rules, alert validation, and operator response</p>
            </div>
          </div>
        </div>
        <div className="analytics-engine-state">
          <i /> Independent analytics path
          <small>Live view and recording remain isolated</small>
        </div>
      </header>

      {message && (
        <div className={`analytics-message ${message.kind}`}>
          {message.kind === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}
          {message.text}
          <button onClick={() => setMessage(undefined)}><X size={14} /></button>
        </div>
      )}

      <section className="analytics-summary">
        <Metric icon={<BellRing />} label="Open alerts" value={summary.open} tone="blue" />
        <Metric icon={<ShieldAlert />} label="Critical P1" value={summary.critical} tone="red" />
        <Metric icon={<Siren />} label="P1 / P2" value={summary.highPriority} tone="amber" />
        <Metric icon={<Activity />} label="Rules on camera" value={rules.filter((rule) => rule.enabled).length} tone="green" />
      </section>

      <section className="analytics-scope-card">
        <div>
          <label htmlFor="analytics-branch">Branch scope</label>
          <select id="analytics-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <ChevronRight size={17} />
        <div>
          <label htmlFor="analytics-camera">Rule camera</label>
          <select id="analytics-camera" value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
            {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
          </select>
        </div>
        <button className="secondary-button" onClick={() => void Promise.all([refreshRules(), refreshAlerts()])}>
          <RefreshCw size={14} /> Refresh
        </button>
      </section>

      <div className="analytics-columns">
        <section className="analytics-card rules-card">
          <div className="analytics-card-heading">
            <div>
              <span className="eyebrow">CAMERA POLICY</span>
              <h2>{activeCamera?.name ?? "Select a camera"}</h2>
              <p>{rules.length} configured rule{rules.length === 1 ? "" : "s"}</p>
            </div>
            <button className="primary-action" disabled={!cameraId} onClick={() => setShowRuleForm(true)}>
              <Plus size={14} /> New rule
            </button>
          </div>
          {rules.length === 0 ? (
            <EmptyState icon={<BrainCircuit />} title="No analytics rules"
              text="Create a rule to turn model detections into actionable alerts." />
          ) : (
            <div className="analytics-rule-list">
              {rules.map((rule) => (
                <article className={`analytics-rule ${rule.enabled ? "" : "disabled"}`} key={rule.id}>
                  <div className="analytics-rule-icon"><CircleDot size={16} /></div>
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{labelFor(rule.detectionType)} · {Math.round(rule.minConfidence * 100)}% · {rule.cooldownSeconds}s cooldown</span>
                    <small>{rule.recordingPolicy.replaceAll("-", " ")}{rule.zone ? ` · ${rule.zone.shape} zone` : ""}</small>
                  </div>
                  <span className={`severity-chip ${rule.severity.toLowerCase()}`}>{rule.severity}</span>
                  <button className={`rule-switch ${rule.enabled ? "on" : ""}`} disabled={saving}
                    onClick={() => void toggleRule(rule)} aria-label={`Toggle ${rule.name}`}><i /></button>
                  <button className="icon-danger" onClick={() => void deleteRule(rule)} aria-label={`Delete ${rule.name}`}>
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="analytics-card alerts-card">
          <div className="analytics-card-heading">
            <div>
              <span className="eyebrow">ALERT QUEUE</span>
              <h2>Operator response</h2>
              <p>Newest detections across this branch</p>
            </div>
            <select aria-label="Alert status filter" value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AnalyticsAlertStatus | "")}>
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
              <option value="false_alarm">False alarm</option>
            </select>
          </div>
          {loading ? (
            <div className="analytics-loading"><RefreshCw size={20} /> Loading analytics...</div>
          ) : alerts.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No matching alerts"
              text="Detections will appear here after an enabled rule matches." />
          ) : (
            <div className="analytics-alert-list">
              {alerts.map((alert) => (
                <article className={`analytics-alert ${alert.severity.toLowerCase()}`} key={alert.id}>
                  <div className="alert-topline">
                    <span className={`severity-chip ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                    <strong>{alert.title}</strong>
                    <span className={`alert-status ${alert.status}`}>{alert.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>{cameraById.get(alert.cameraId)?.name ?? "Camera"} · {Math.round(alert.confidence * 100)}% confidence · {alert.modelVersion}</p>
                  <div className="alert-meta">
                    <span><Clock3 size={12} />{new Date(alert.lastDetectedAt).toLocaleString()}</span>
                    {alert.occurrenceCount > 1 && <span>{alert.occurrenceCount} occurrences</span>}
                    {alert.objectClasses.length > 0 && <span><UsersRound size={12} />{alert.objectClasses.join(", ")}</span>}
                    {alert.incidentId && <span className="protected"><ShieldCheck size={12} />Evidence protected</span>}
                  </div>
                  {!terminal(alert.status) && (
                    <div className="alert-actions">
                      {alert.status === "new" && <button onClick={() => void mutateAlert(alert, "acknowledge")}><Check size={13} />Acknowledge</button>}
                      <button onClick={() => void mutateAlert(alert, "investigating")}><Activity size={13} />Investigate</button>
                      <button onClick={() => void mutateAlert(alert, "escalate")}><Siren size={13} />Escalate</button>
                      {!alert.incidentId && <button onClick={() => void mutateAlert(alert, "incident")}><ShieldAlert size={13} />Create incident</button>}
                      <button onClick={() => void mutateAlert(alert, "resolved")}><ShieldCheck size={13} />Resolve</button>
                      <button onClick={() => void mutateAlert(alert, "false_alarm")}>False alarm</button>
                      {alert.snapshotReference && <a href={alert.snapshotReference} target="_blank" rel="noreferrer"><ExternalLink size={13} />Snapshot</a>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {showRuleForm && cameraId && (
        <RuleForm cameraId={cameraId} saving={saving}
          onCancel={() => setShowRuleForm(false)}
          onSave={async (payload) => {
            setSaving(true);
            try {
              await analyticsApi.createRule(cameraId, payload);
              await refreshRules();
              setShowRuleForm(false);
              setMessage({ kind: "success", text: "Analytics rule created." });
            } catch (error) {
              setMessage({ kind: "error", text: readable(error) });
            } finally {
              setSaving(false);
            }
          }} />
      )}
    </>
  );
}

function RuleForm({ cameraId, saving, onCancel, onSave }: {
  cameraId: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("Person in restricted area");
  const [detectionType, setDetectionType] = useState<AnalyticsDetectionType>("person");
  const [severity, setSeverity] = useState<AnalyticsSeverity>("P2");
  const [confidence, setConfidence] = useState(70);
  const [duration, setDuration] = useState(2);
  const [cooldown, setCooldown] = useState(60);
  const [classes, setClasses] = useState("person");
  const [recipients, setRecipients] = useState("");
  const [recordingPolicy, setRecordingPolicy] = useState<AnalyticsRule["recordingPolicy"]>("protect-window");
  const [zoneEnabled, setZoneEnabled] = useState(false);
  const [zoneShape, setZoneShape] = useState<"polygon" | "line">("polygon");
  const [points, setPoints] = useState("0.10,0.10; 0.90,0.10; 0.90,0.90; 0.10,0.90");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [formError, setFormError] = useState<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(undefined);
    try {
      const zonePoints = points.split(";").map((value) => {
        const [x, y] = value.trim().split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x! < 0 || x! > 1 || y! < 0 || y! > 1) {
          throw new Error("Zone points must use normalized x,y values between 0 and 1.");
        }
        return { x, y };
      });
      if (zoneEnabled && ((zoneShape === "line" && zonePoints.length !== 2) ||
          (zoneShape === "polygon" && zonePoints.length < 3))) {
        throw new Error(zoneShape === "line" ? "A line needs exactly two points." : "A polygon needs at least three points.");
      }
      await onSave({
        name, detectionType, enabled: true, severity,
        minConfidence: confidence / 100, minDurationSeconds: duration,
        cooldownSeconds: cooldown, direction: "any",
        objectClasses: csv(classes), recipients: csv(recipients),
        recordingPolicy, preRollSeconds: 30, postRollSeconds: 120,
        ...(zoneEnabled ? { zone: { name: `${name} zone`, shape: zoneShape, points: zonePoints } } : {}),
        ...(scheduleEnabled ? { schedule: {
          days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", timezone: "Asia/Kolkata",
        } } : {}),
      });
    } catch (error) {
      setFormError(readable(error));
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create analytics rule">
      <form className="analytics-rule-form" onSubmit={(event) => void submit(event)}>
        <div className="modal-header">
          <div><h2>New analytics rule</h2><p>Camera {cameraId}</p></div>
          <button type="button" onClick={onCancel}><X size={17} /></button>
        </div>
        {formError && <div className="analytics-message error"><AlertTriangle size={15} />{formError}</div>}
        <div className="analytics-form-grid">
          <label className="wide">Rule name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
          <label>Detection<select value={detectionType} onChange={(event) => setDetectionType(event.target.value as AnalyticsDetectionType)}>{detectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Priority<select value={severity} onChange={(event) => setSeverity(event.target.value as AnalyticsSeverity)}>{["P1", "P2", "P3", "P4", "P5"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Confidence (%)<input type="number" min="1" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
          <label>Minimum duration (s)<input type="number" min="0" max="86400" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
          <label>Cooldown (s)<input type="number" min="0" max="86400" value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /></label>
          <label>Recording policy<select value={recordingPolicy} onChange={(event) => setRecordingPolicy(event.target.value as AnalyticsRule["recordingPolicy"])}><option value="none">Alert only</option><option value="event-recording">Trigger event recording</option><option value="protect-window">Create protected incident</option></select></label>
          <label className="wide">Object classes (comma separated)<input value={classes} onChange={(event) => setClasses(event.target.value)} placeholder="person, vehicle" /></label>
          <label className="wide">Recipients (comma separated)<input value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="soc@example.com, branch-manager" /></label>
        </div>
        <div className="analytics-form-options">
          <label><input type="checkbox" checked={zoneEnabled} onChange={(event) => setZoneEnabled(event.target.checked)} /> Use line / polygon region</label>
          <label><input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} /> Weekdays, 09:00–18:00 IST</label>
        </div>
        {zoneEnabled && <div className="analytics-zone-row"><select value={zoneShape} onChange={(event) => setZoneShape(event.target.value as "polygon" | "line")}><option value="polygon">Polygon</option><option value="line">Line</option></select><input value={points} onChange={(event) => setPoints(event.target.value)} aria-label="Normalized zone points" /><small>Format: x,y; x,y using 0–1 frame coordinates</small></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-action" disabled={saving}><Save size={14} />{saving ? "Saving..." : "Create rule"}</button>
        </div>
      </form>
    </div>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return <article className="analytics-metric"><span className={tone}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}
function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="analytics-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}
function csv(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function labelFor(type: AnalyticsDetectionType) { return detectionOptions.find((item) => item.value === type)?.label ?? type; }
function terminal(status: AnalyticsAlertStatus) { return ["resolved", "false_alarm", "suppressed"].includes(status); }
function readable(error: unknown) { return error instanceof Error ? error.message : "The analytics operation failed."; }
