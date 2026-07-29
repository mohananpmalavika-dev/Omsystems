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
  };

  const updateSchedule = (index: number, schedule: AlertNotificationPolicySchedule) => {
    if (!input) return;
    const schedules = [...input.onCallSchedules];
    schedules[index] = schedule;
    setInput({ ...input, onCallSchedules: schedules });
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

  const handleSubmit = async () => {
    if (!input) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await alertPolicyApi.update(input);
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
      setMessage("Notification policy saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notification policy");
    } finally {
      setSaving(false);
    }
  };

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
            {matrix ? Object.entries(matrix).map(([severity, channels]) => (
              <div key={severity} className="rounded border p-3">
                <div className="text-sm font-semibold">{severity}</div>
                <div className="text-xs text-slate-600">{channels.join(", ")}</div>
              </div>
            )) : <p className="text-sm text-gray-600">Loading notification matrix…</p>}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} />Quiet hours</header>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="field">Start<input type="time" value={input.quietHours?.start ?? "22:00"} onChange={(event) => setInput({ ...input, quietHours: { ...(input.quietHours ?? { timezone: "UTC" }), start: event.target.value, end: input.quietHours?.end ?? "06:00" } })} className="field-input" /></label>
            <label className="field">End<input type="time" value={input.quietHours?.end ?? "06:00"} onChange={(event) => setInput({ ...input, quietHours: { ...(input.quietHours ?? { timezone: "UTC" }), start: input.quietHours?.start ?? "22:00", end: event.target.value } })} className="field-input" /></label>
            <label className="field">Timezone<input type="text" value={input.quietHours?.timezone ?? "UTC"} onChange={(event) => setInput({ ...input, quietHours: { ...(input.quietHours ?? { start: "22:00", end: "06:00" }), timezone: event.target.value } })} className="field-input" /></label>
            <label className="field">Rate limit per minute<input type="number" min={1} value={input.rateLimitPerMinute} onChange={(event) => setInput({ ...input, rateLimitPerMinute: Number(event.target.value) })} className="field-input" /></label>
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
          <button type="button" className="primary-button flex items-center gap-2" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : <><Save size={16} />Save policy</>}</button>
          <button type="button" className="btn-secondary" onClick={loadPolicy} disabled={saving}>Reload</button>
        </div>
      </div>
    </ModulePage>
  );
}
