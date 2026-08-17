"use client";

import { useEffect, useState } from "react";
import { Bell, Clock3, Plus, Save, Trash2 } from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { alertPolicyApi } from "@/lib/api-client";
import type { AlertNotificationPolicy, AlertNotificationPolicyInput, AlertNotificationPolicySchedule } from "@/lib/types";

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
  };

  const removeSchedule = (index: number) => {
    if (!input) return;
    const schedules = [...input.onCallSchedules];
    schedules.splice(index, 1);
    setInput({ ...input, onCallSchedules: schedules });
  };

  const handleSubmit = async (mode: "draft" | "publish" = "draft") => {
    if (!input) return;
    setSaving(true);
    setSaveState("saving");
    setError(null);
    setMessage(null);
    try {
      const payload = {
        ...input,
        status: mode === "publish" ? "published" : "draft",
        policyVersion: (policy?.policyVersion ?? 1) + (mode === "publish" ? 1 : 0),
      } as AlertNotificationPolicyInput;
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
        policyVersion: response.data.policyVersion ?? payload.policyVersion,
        status: response.data.status ?? payload.status,
      });
      setIsDirty(false);
      setSaveState("saved");
      setMessage(mode === "publish" ? "Notification policy published successfully." : "Notification policy saved successfully.");
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
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
              {policy?.status ?? "draft"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={isDirty ? "text-amber-600" : "text-emerald-600"}>{isDirty ? "Unsaved changes" : "Saved"}</span>
            <span>•</span>
            <span>v{policy?.policyVersion ?? 1}</span>
          </div>
        </div>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} />Recipient groups</header>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="field">Email recipients<textarea value={displayList(input.recipientGroups.email)} onChange={(event) => setGroupRecipients("email", event.target.value)} className="field-input" placeholder="one@example.com\nother@example.com" /></label>
            <label className="field">SMS recipients<textarea value={displayList(input.recipientGroups.sms)} onChange={(event) => setGroupRecipients("sms", event.target.value)} className="field-input" placeholder="+919100000001\n+919100000002" /></label>
            <label className="field">Voice recipients<textarea value={displayList(input.recipientGroups.voice)} onChange={(event) => setGroupRecipients("voice", event.target.value)} className="field-input" placeholder="+918888888888\n+918888888889" /></label>
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} />Notification matrix</header>
          <div className="grid gap-4 md:grid-cols-5">
            {severityMatrix.map(({ severity, channels }) => (
              <div key={severity} className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">{severity}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-700">
                  {channels.map((channel) => (
                    <span key={`${severity}-${channel}`} className="rounded border border-slate-300 bg-white px-2 py-0.5 uppercase">
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} />Quiet hours</header>
          <div className="grid gap-4 md:grid-cols-5">
            <label className="field">Start<input type="time" value={input.quietHours?.start ?? "22:00"} onChange={(event) => { const nextQuietHours = { ...(input.quietHours ?? { timezone: "UTC" }), start: event.target.value, end: input.quietHours?.end ?? "06:00" }; setInput({ ...input, quietHours: nextQuietHours }); setIsDirty(true); setSaveState("unsaved"); }} className="field-input" /></label>
            <label className="field">End<input type="time" value={input.quietHours?.end ?? "06:00"} onChange={(event) => { const nextQuietHours = { ...(input.quietHours ?? { timezone: "UTC", start: "22:00" }), start: input.quietHours?.start ?? "22:00", end: event.target.value }; setInput({ ...input, quietHours: nextQuietHours }); setIsDirty(true); setSaveState("unsaved"); }} className="field-input" /></label>
            <label className="field">Timezone<select value={input.quietHours?.timezone ?? "UTC"} onChange={(event) => { const nextQuietHours = { ...(input.quietHours ?? { start: "22:00", end: "06:00" }), timezone: event.target.value }; setInput({ ...input, quietHours: nextQuietHours }); setIsDirty(true); setSaveState("unsaved"); }} className="field-input">
              {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
            </select></label>
            <label className="field">Rate limit per minute<input type="number" min={1} value={input.rateLimitPerMinute} onChange={(event) => { setInput({ ...input, rateLimitPerMinute: Number(event.target.value) }); setIsDirty(true); setSaveState("unsaved"); }} className="field-input" /></label>
            <label className="field">Enabled<input type="checkbox" checked={input.quietHours?.enabled ?? true} onChange={(event) => { const nextQuietHours = { ...(input.quietHours ?? { start: "22:00", end: "06:00", timezone: "UTC" }), enabled: event.target.checked }; setInput({ ...input, quietHours: nextQuietHours }); setIsDirty(true); setSaveState("unsaved"); }} className="field-input" /></label>
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} />Escalation timing</header>
          <div className="grid gap-4 md:grid-cols-3">
            {(["P1", "P2", "P3", "P4", "P5"] as const).map((severity) => (
              <label key={severity} className="field">
                {severity} escalation seconds
                <input type="number" min={10} value={input.escalationAfterSeconds[severity] ?? 0} onChange={(event) => setInput({
                  ...input,
                  escalationAfterSeconds: {
                    ...input.escalationAfterSeconds,
                    [severity]: Number(event.target.value),
                  },
                })} className="field-input" />
              </label>
            ))}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} />On-call schedules</div>
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={addSchedule}><Plus size={14} />Add schedule</button>
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

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={loadPolicy} disabled={saving}>Reload</button>
          <button type="button" className="btn-secondary" onClick={() => setInput({ ...(input ?? { recipientGroups: {}, onCallSchedules: [], rateLimitPerMinute: 120, escalationAfterSeconds: { P1: 30, P2: 300, P3: 900 } }), quietHours: { ...(input?.quietHours ?? { start: "22:00", end: "06:00", timezone: "UTC", enabled: true }), enabled: input?.quietHours?.enabled ?? true } })} disabled={saving}>Discard</button>
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => handleSubmit("draft")} disabled={saving}>{saving ? "Saving…" : <><Save size={16} />Save draft</>}</button>
          <button type="button" className="primary-button flex items-center gap-2" onClick={() => handleSubmit("publish")} disabled={saving}>{saving ? "Publishing…" : <><ShieldCheck size={16} />Publish</>}</button>
        </div>
      </div>
    </ModulePage>
  );
}
