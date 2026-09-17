"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Clock3, Plus, ShieldCheck, Trash2, UserCheck, PhoneCall, Radio, AlertOctagon, Siren, CheckCircle2, Play, RefreshCw, Volume2, ShieldAlert, ArrowRight, Shield } from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { alertPolicyApi } from "@/lib/api-client";
import type { AlertNotificationPolicy, AlertNotificationPolicyInput, AlertNotificationPolicySchedule } from "@/lib/types";

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const DEFAULT_POLICY_INPUT: AlertNotificationPolicyInput = {
  recipientGroups: {
    email: [],
    sms: [],
    voice: [],
  },
  onCallSchedules: [],
  quietHours: {
    start: "22:00",
    end: "06:00",
    timezone: "UTC",
    enabled: true,
  },
  rateLimitPerMinute: 120,
  escalationAfterSeconds: {
    P1: 30,
    P2: 300,
    P3: 900,
    P4: 3600,
    P5: 7200,
  },
  smsTemplates: {},
  smsTemplateIds: {},
};

function normalizeList(value: string | undefined) {
  return value?.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function displayList(values?: string[]) {
  return (values ?? []).join("\n");
}

export default function AlertNotificationPolicyPage() {
  const [policy, setPolicy] = useState<AlertNotificationPolicy | null>(null);
  const [input, setInput] = useState<AlertNotificationPolicyInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Record<string, string[]> | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [, setSaveState] = useState<"idle" | "saving" | "saved" | "unsaved" | "failed">("idle");

  // Enterprise SOP Escalation Hierarchy & Drill Simulator State
  const [drillRunning, setDrillRunning] = useState(false);
  const [drillScenario, setDrillScenario] = useState<string>("vault_open");
  const [drillCountdown, setDrillCountdown] = useState<number>(60);
  const [drillTier, setDrillTier] = useState<1 | 2 | 3 | 4>(1);
  const [drillAcknowledged, setDrillAcknowledged] = useState(false);
  const [drillLogs, setDrillLogs] = useState<Array<{ time: string; tier: number; msg: string; status: "dispatched" | "acknowledged" | "pending" }>>([]);

  const loadPolicy = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await alertPolicyApi.get();
      setPolicy(response.data);
      setMatrix(response.matrix ?? null);
      setInput({
        recipientGroups: response.data.recipientGroups ?? {},
        onCallSchedules: response.data.onCallSchedules ?? [],
        quietHours: response.data.quietHours,
        rateLimitPerMinute: response.data.rateLimitPerMinute,
        escalationAfterSeconds: response.data.escalationAfterSeconds,
        smsTemplates: response.data.smsTemplates ?? {},
        smsTemplateIds: response.data.smsTemplateIds ?? {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notification policy");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPolicy();
  }, []);

  const setGroupRecipients = (channel: "email" | "sms" | "voice", value: string) => {
    if (!input) return;
    setInput({
      ...input,
      recipientGroups: {
        ...input.recipientGroups,
        [channel]: normalizeList(value),
      },
    });
    setIsDirty(true);
    setSaveState("unsaved");
  };

  const updateSchedule = (index: number, schedule: AlertNotificationPolicySchedule) => {
    if (!input) return;
    const schedules = [...input.onCallSchedules];
    schedules[index] = schedule;
    setInput({ ...input, onCallSchedules: schedules });
    setIsDirty(true);
    setSaveState("unsaved");
  };

  const addSchedule = () => {
    if (!input) return;
    setInput({
      ...input,
      onCallSchedules: [
        ...input.onCallSchedules,
        {
          name: "New on-call schedule",
          days: [1, 2, 3, 4, 5],
          start: "09:00",
          end: "17:00",
          timezone: "UTC",
          recipients: {},
        },
      ],
    });
    setIsDirty(true);
    setSaveState("unsaved");
  };

  const removeSchedule = (index: number) => {
    if (!input) return;
    const schedules = [...input.onCallSchedules];
    schedules.splice(index, 1);
    setInput({ ...input, onCallSchedules: schedules });
    setIsDirty(true);
    setSaveState("unsaved");
  };

  // SOP Escalation Drill Simulation Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (drillRunning && !drillAcknowledged && drillCountdown > 0) {
      interval = setInterval(() => {
        setDrillCountdown((prev) => {
          const next = prev - 1;
          if (next === 45 && drillTier === 1) {
            setDrillTier(2);
            setDrillLogs((l) => [
              {
                time: new Date().toLocaleTimeString(),
                tier: 2,
                msg: "Tier 1 Guard SLA Breached (45s). Auto-triggered Tier 2: Automated Malayalam/English IVR Call to Branch Manager (+91 94470 12345) & Push Alert.",
                status: "dispatched",
              },
              ...l,
            ]);
          } else if (next === 20 && drillTier === 2) {
            setDrillTier(3);
            setDrillLogs((l) => [
              {
                time: new Date().toLocaleTimeString(),
                tier: 3,
                msg: "Tier 2 BM SLA Breached (20s). Auto-triggered Tier 3: Regional Security Officer (RSO) & Central SOC Surveillance Supervisor SMS & Snapshot Uplink.",
                status: "dispatched",
              },
              ...l,
            ]);
          } else if (next === 0 && drillTier === 3) {
            setDrillTier(4);
            setDrillLogs((l) => [
              {
                time: new Date().toLocaleTimeString(),
                tier: 4,
                msg: "CRITICAL P1 BREACH (>300s SLA): Escalated to Tier 4 CRO, CISO, and Police 112 Control Room dispatch with live GPS pin.",
                status: "dispatched",
              },
              ...l,
            ]);
            setDrillRunning(false);
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [drillRunning, drillAcknowledged, drillCountdown, drillTier]);

  const startDrill = () => {
    setDrillAcknowledged(false);
    setDrillCountdown(60);
    setDrillTier(1);
    setDrillRunning(true);
    setDrillLogs([
      {
        time: new Date().toLocaleTimeString(),
        tier: 1,
        msg: `Initiated Incident Drill [${drillScenario.toUpperCase()}]. Tier 1: Local Hooter Strobe Activated, Handheld PTT alert sent to Guard Desk.`,
        status: "dispatched",
      },
    ]);
  };

  const acknowledgeDrill = () => {
    setDrillAcknowledged(true);
    setDrillRunning(false);
    setDrillLogs((l) => [
      {
        time: new Date().toLocaleTimeString(),
        tier: drillTier,
        msg: `Drill Incident ACKNOWLEDGED by SOC Operator (UID #OPR-4029). Escalation chain halted safely.`,
        status: "acknowledged",
      },
      ...l,
    ]);
  };

  const handleSubmit = async () => {
    if (!input) return;
    setSaving(true);
    setSaveState("saving");
    setError(null);
    setMessage(null);
    try {
      const payload = { ...input } as AlertNotificationPolicyInput;
      const response = await alertPolicyApi.update(payload);
      setPolicy(response.data);
      setMatrix(response.matrix ?? null);
      setInput({
        recipientGroups: response.data.recipientGroups ?? {},
        onCallSchedules: response.data.onCallSchedules ?? [],
        quietHours: response.data.quietHours,
        rateLimitPerMinute: response.data.rateLimitPerMinute,
        escalationAfterSeconds: response.data.escalationAfterSeconds,
        smsTemplates: response.data.smsTemplates ?? {},
        smsTemplateIds: response.data.smsTemplateIds ?? {},
      });
      setIsDirty(false);
      setSaveState("saved");
      setMessage("Notification policy saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notification policy");
      setSaveState("failed");
    } finally {
      setSaving(false);
    }
  };

  const severityMatrix = useMemo(() => [
    { severity: "P1", channels: ["dashboard", "email", "sms", "voice", "push"] },
    { severity: "P2", channels: ["dashboard", "email", "sms", "voice", "push"] },
    { severity: "P3", channels: ["dashboard", "email", "sms"] },
    { severity: "P4", channels: ["dashboard", "email"] },
    { severity: "P5", channels: ["dashboard"] },
  ], []);

  if (!input) {
    return (
      <ModulePage
        eyebrow="Alert configuration"
        title="Alert notification policy"
        description="Configure tenant-level email, SMS, and voice recipient groups along with on-call schedules and escalation settings."
        icon={Bell}
        loading={loading}
        error={error}
        onRetry={loadPolicy}
      >
        <div className="module-state" />
      </ModulePage>
    );
  }

  return (
    <ModulePage
      eyebrow="Alert configuration"
      title="Alert notification policy"
      description="Configure tenant-level email, SMS, and voice recipient groups along with on-call schedules and escalation settings."
      icon={Bell}
      loading={loading}
      error={error}
      onRetry={loadPolicy}
    >
      <div className="space-y-6">
        {message ? <div className="module-alert positive"><strong>{message}</strong></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="font-semibold">Notification policy</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={isDirty ? "text-amber-600" : "text-emerald-600"}>{isDirty ? "Unsaved changes" : "Saved"}</span>
            <span>•</span>
            <span>v{policy?.policyVersion ?? 1}</span>
          </div>
        </div>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock3 size={16} className="text-slate-700" />
            <span>Recipient groups</span>
          </header>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">Email recipients</span>
              <textarea 
                value={displayList(input.recipientGroups.email)} 
                onChange={(event) => setGroupRecipients("email", event.target.value)} 
                className="field-input" 
                rows={4}
                placeholder="one@example.com&#10;other@example.com" 
              />
            </label>
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">SMS recipients</span>
              <textarea 
                value={displayList(input.recipientGroups.sms)} 
                onChange={(event) => setGroupRecipients("sms", event.target.value)} 
                className="field-input" 
                rows={4}
                placeholder="+919100000001&#10;+919100000002" 
              />
            </label>
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">Voice recipients</span>
              <textarea 
                value={displayList(input.recipientGroups.voice)} 
                onChange={(event) => setGroupRecipients("voice", event.target.value)} 
                className="field-input" 
                rows={4}
                placeholder="+918888888888&#10;+918888888889" 
              />
            </label>
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell size={16} className="text-slate-700" />
            <span>Notification matrix</span>
          </header>
          <div className="grid gap-4 md:grid-cols-5">
            {severityMatrix.map(({ severity, channels }) => (
              <div key={severity} className="rounded-lg border border-slate-300 bg-slate-50 p-4">
                <div className="text-base font-bold text-slate-900 mb-3">{severity}</div>
                <div className="flex flex-col gap-1.5 text-xs text-slate-800">
                  {channels.map((channel) => (
                    <span key={`${severity}-${channel}`} className="rounded border border-slate-400 bg-white px-2 py-1 font-medium capitalize">
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock3 size={16} className="text-slate-700" />
            <div>
              <span className="block">Alert delivery timing</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">Pause external delivery during quiet hours while the dashboard continues to show every alert.</span>
            </div>
          </header>
          <div className="grid gap-4 md:grid-cols-5">
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">Start</span>
              <input 
                type="time" 
                value={input.quietHours?.start ?? "22:00"} 
                onChange={(event) => { 
                  const nextQuietHours = { ...(input.quietHours ?? { timezone: "UTC" }), start: event.target.value, end: input.quietHours?.end ?? "06:00" }; 
                  setInput({ ...input, quietHours: nextQuietHours }); 
                  setIsDirty(true); 
                  setSaveState("unsaved"); 
                }} 
                className="field-input" 
              />
            </label>
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">End</span>
              <input 
                type="time" 
                value={input.quietHours?.end ?? "06:00"} 
                onChange={(event) => { 
                  const nextQuietHours = { ...(input.quietHours ?? { timezone: "UTC", start: "22:00" }), start: input.quietHours?.start ?? "22:00", end: event.target.value }; 
                  setInput({ ...input, quietHours: nextQuietHours }); 
                  setIsDirty(true); 
                  setSaveState("unsaved"); 
                }} 
                className="field-input" 
              />
            </label>
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">Timezone</span>
              <select 
                value={input.quietHours?.timezone ?? "UTC"} 
                onChange={(event) => { 
                  const nextQuietHours = { ...(input.quietHours ?? { start: "22:00", end: "06:00" }), timezone: event.target.value }; 
                  setInput({ ...input, quietHours: nextQuietHours }); 
                  setIsDirty(true); 
                  setSaveState("unsaved"); 
                }} 
                className="field-input"
              >
                {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="text-sm font-medium text-slate-900 mb-1.5 block">Rate limit per minute</span>
              <input 
                type="number" 
                min={1} 
                value={input.rateLimitPerMinute} 
                onChange={(event) => { 
                  setInput({ ...input, rateLimitPerMinute: Number(event.target.value) }); 
                  setIsDirty(true); 
                  setSaveState("unsaved"); 
                }} 
                className="field-input" 
              />
            </label>
            <label className="field flex flex-col justify-end">
              <div className="flex items-center gap-2 h-10">
                <input 
                  type="checkbox" 
                  checked={input.quietHours?.enabled ?? true} 
                  onChange={(event) => { 
                    const nextQuietHours = { ...(input.quietHours ?? { start: "22:00", end: "06:00", timezone: "UTC" }), enabled: event.target.checked }; 
                    setInput({ ...input, quietHours: nextQuietHours }); 
                    setIsDirty(true); 
                    setSaveState("unsaved"); 
                  }} 
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500" 
                />
                <span className="text-sm font-medium text-slate-900">Enabled</span>
              </div>
            </label>
          </div>
          <fieldset className="border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-900">Always notify for</legend>
            <p className="mt-1 text-xs text-slate-500">Selected severities bypass quiet hours for SMS, email, and voice calls.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(["P1", "P2", "P3", "P4", "P5"] as const).map((severity) => {
                const selected = (input.quietHours?.bypassSeverities ?? ["P1"]).includes(severity);
                return (
                  <label key={severity} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const existing = input.quietHours?.bypassSeverities ?? ["P1"];
                        const bypassSeverities = event.target.checked
                          ? [...new Set([...existing, severity])]
                          : existing.filter((item) => item !== severity);
                        setInput({
                          ...input,
                          quietHours: {
                            ...(input.quietHours ?? { start: "22:00", end: "06:00", timezone: "UTC", enabled: true }),
                            bypassSeverities,
                          },
                        });
                        setIsDirty(true);
                        setSaveState("unsaved");
                      }}
                    />
                    <span>{severity}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell size={16} className="text-slate-700" />
            <span>Escalation timing</span>
          </header>
          <div className="grid gap-4 md:grid-cols-5">
            {(["P1", "P2", "P3", "P4", "P5"] as const).map((severity) => (
              <label key={severity} className="field">
                <span className="text-sm font-medium text-slate-900 mb-1.5 block">{severity} escalation seconds</span>
                <input 
                  type="number" 
                  min={10}
                  value={input.escalationAfterSeconds[severity] ?? 0} 
                  onChange={(event) => {
                    setInput({
                      ...input,
                      escalationAfterSeconds: {
                        ...input.escalationAfterSeconds,
                        [severity]: Number(event.target.value),
                      },
                    });
                    setIsDirty(true);
                    setSaveState("unsaved");
                  }}
                  className="field-input" 
                />
              </label>
            ))}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bell size={16} className="text-slate-700" />
              <span>On-call schedules</span>
            </div>
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={addSchedule}>
              <Plus size={14} />
              <span>Add schedule</span>
            </button>
          </header>
          <div className="space-y-4">
            {input.onCallSchedules.length === 0 ? <p className="text-sm text-gray-600">No on-call schedules configured yet.</p> : null}
            {input.onCallSchedules.map((schedule, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{schedule.name}</strong>
                  <button type="button" className="btn-danger flex items-center gap-2" onClick={() => removeSchedule(index)}><Trash2 size={14} />Remove</button>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <label className="field">Name<input type="text" value={schedule.name} onChange={(event) => updateSchedule(index, { ...schedule, name: event.target.value })} className="field-input" /></label>
                  <label className="field">Timezone<input type="text" value={schedule.timezone} onChange={(event) => updateSchedule(index, { ...schedule, timezone: event.target.value })} className="field-input" /></label>
                  <label className="field">Start<input type="time" value={schedule.start} onChange={(event) => updateSchedule(index, { ...schedule, start: event.target.value })} className="field-input" /></label>
                  <label className="field">End<input type="time" value={schedule.end} onChange={(event) => updateSchedule(index, { ...schedule, end: event.target.value })} className="field-input" /></label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="field">Days<textarea value={schedule.days.join(",")} onChange={(event) => updateSchedule(index, { ...schedule, days: event.target.value.split(/[,\s]+/).map((token) => Number(token)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6) })} className="field-input" placeholder="0,1,2,3,4,5,6" /></label>
                  <label className="field">Email recipients<textarea value={displayList(schedule.recipients.email)} onChange={(event) => updateSchedule(index, { ...schedule, recipients: { ...schedule.recipients, email: normalizeList(event.target.value) } })} className="field-input" placeholder="night@example.com" /></label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="field">SMS recipients<textarea value={displayList(schedule.recipients.sms)} onChange={(event) => updateSchedule(index, { ...schedule, recipients: { ...schedule.recipients, sms: normalizeList(event.target.value) } })} className="field-input" placeholder="+919100000001" /></label>
                  <label className="field">Voice recipients<textarea value={displayList(schedule.recipients.voice)} onChange={(event) => updateSchedule(index, { ...schedule, recipients: { ...schedule.recipients, voice: normalizeList(event.target.value) } })} className="field-input" placeholder="+918888888888" /></label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Enterprise Banking Multi-Tier SOP Escalation Hierarchy Matrix */}
        <section className="card p-5 space-y-5 border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/5 via-slate-900/40 to-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                <Siren className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  RBI Master Direction: Multi-Tier SOP Incident Escalation Hierarchy
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Tier-1 NBFC Standard
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated chronological role escalation cascade for high-risk physical & cyber breaches (Vault, Cash, Silent Duress).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {/* Tier 1 */}
            <div className={`p-4 rounded-xl border transition-all ${drillTier === 1 && drillRunning ? "bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/40" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold text-[10px] uppercase tracking-wider">
                  Tier 1 • 0-60s
                </span>
                <Radio className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">On-Duty Branch Guard</h4>
              <p className="text-xs text-slate-400 mt-1">Local Hooter Strobe & Handheld PTT Radio prompt</p>
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>SLA Window:</span>
                <strong className="text-amber-400 font-mono">&le; 60 seconds</strong>
              </div>
            </div>

            {/* Tier 2 */}
            <div className={`p-4 rounded-xl border transition-all ${drillTier === 2 && drillRunning ? "bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/40" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold text-[10px] uppercase tracking-wider">
                  Tier 2 • 60-180s
                </span>
                <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">Branch Manager & Custodian</h4>
              <p className="text-xs text-slate-400 mt-1">Automated Bilingual IVR Call & Push Notification</p>
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>SLA Window:</span>
                <strong className="text-amber-400 font-mono">&le; 180 seconds</strong>
              </div>
            </div>

            {/* Tier 3 */}
            <div className={`p-4 rounded-xl border transition-all ${drillTier === 3 && drillRunning ? "bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/40" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-semibold text-[10px] uppercase tracking-wider">
                  Tier 3 • 180-300s
                </span>
                <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">Regional Security Officer</h4>
              <p className="text-xs text-slate-400 mt-1">Central SOC Video Feed Dispatch & SMS Uplink</p>
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>SLA Window:</span>
                <strong className="text-purple-400 font-mono">&le; 300 seconds</strong>
              </div>
            </div>

            {/* Tier 4 */}
            <div className={`p-4 rounded-xl border transition-all ${drillTier === 4 && drillRunning ? "bg-red-500/20 border-red-500 ring-2 ring-red-500/50" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold text-[10px] uppercase tracking-wider">
                  Tier 4 • SLA Breach
                </span>
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">CRO, CISO & Police 112</h4>
              <p className="text-xs text-slate-400 mt-1">Armed QRT GPS Dispatch & Kerala Police Auto-Bridge</p>
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Trigger:</span>
                <strong className="text-red-400 font-mono">&gt; 300s Unacknowledged</strong>
              </div>
            </div>
          </div>

          {/* Interactive Live Drill Simulator */}
          <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Live SOP Cascade Drill & Voice Dispatch Simulator
                </span>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={drillScenario}
                  onChange={(e) => setDrillScenario(e.target.value)}
                  disabled={drillRunning}
                  className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  <option value="vault_open">Scenario 1: Vault Door Open After 19:30</option>
                  <option value="silent_duress">Scenario 2: Cash Counter Silent Duress (*911#)</option>
                  <option value="acoustic_shutter">Scenario 3: Acoustic Shutter Drilling Attack</option>
                  <option value="atm_tamper">Scenario 4: ATM Safe Skimmer & Multiple Occupants</option>
                </select>

                {!drillRunning ? (
                  <button
                    type="button"
                    onClick={startDrill}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run SOP Drill
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={acknowledgeDrill}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm animate-pulse"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Acknowledge & Stop Drill ({drillCountdown}s)
                  </button>
                )}
              </div>
            </div>

            {/* Bilingual Voice Dispatch Audio Script Box */}
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 font-mono font-medium">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Automated Bilingual IVR Script (Malayalam + English Engine):</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800 font-sans leading-relaxed">
                  <span className="text-[10px] text-amber-400 uppercase font-mono block mb-0.5">Malayalam TTS Voice:</span>
                  &ldquo;ശ്രദ്ധിക്കുക: കൽപ്പറ്റ ശാഖയിലെ സ്ട്രോങ് റൂം അടിയന്തര സുരക്ഷാ അലാറം പ്രവർത്തനക്ഷമമായിരിക്കുന്നു. ശാഖാ അധികൃതർ ഉടൻ പരിശോധിക്കുക.&rdquo;
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800 font-sans leading-relaxed">
                  <span className="text-[10px] text-amber-400 uppercase font-mono block mb-0.5">English TTS Voice:</span>
                  &ldquo;Priority Alert: Strong room security perimeter triggered at Kalpetta Branch KL-07. Authorized custodians are requested to verify immediately.&rdquo;
                </div>
              </div>
            </div>

            {/* Live Drill Log stream */}
            {drillLogs.length > 0 && (
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] max-h-32 overflow-y-auto space-y-1">
                {drillLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-300">
                    <span className="text-slate-500">[{log.time}]</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                      log.tier === 1 ? "bg-blue-500/20 text-blue-300" :
                      log.tier === 2 ? "bg-amber-500/20 text-amber-300" :
                      log.tier === 3 ? "bg-purple-500/20 text-purple-300" :
                      "bg-red-500/20 text-red-300"
                    }`}>
                      T{log.tier}
                    </span>
                    <span className={log.status === "acknowledged" ? "text-emerald-400 font-semibold" : "text-slate-300"}>
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={loadPolicy} disabled={saving}>Reload</button>
          <button type="button" className="btn-secondary" onClick={() => setInput({ ...(input ?? { recipientGroups: {}, onCallSchedules: [], rateLimitPerMinute: 120, escalationAfterSeconds: { P1: 30, P2: 300, P3: 900 } }), quietHours: { ...(input?.quietHours ?? { start: "22:00", end: "06:00", timezone: "UTC", enabled: true }), enabled: input?.quietHours?.enabled ?? true } })} disabled={saving}>Discard</button>
          <button type="button" className="primary-button flex items-center gap-2" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : <><ShieldCheck size={16} />Save policy</>}</button>
        </div>
      </div>
    </ModulePage>
  );
}
