"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save, Siren } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";

type IncidentForm = {
  title: string;
  description: string;
  incidentType: string;
  severity: "P1" | "P2" | "P3" | "P4" | "P5";
  occurredAt: string;
  confidentialityLevel: "public" | "internal" | "confidential" | "restricted" | "highly-restricted";
  policeRequired: boolean;
  insuranceRequired: boolean;
};

const initialForm: IncidentForm = {
  title: "",
  description: "",
  incidentType: "other",
  severity: "P3",
  occurredAt: "",
  confidentialityLevel: "internal",
  policeRequired: false,
  insuranceRequired: false,
};

export default function CreateIncidentPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <Key extends keyof IncidentForm>(key: Key, value: IncidentForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/control/v1/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
          detectionSource: "manual-operator",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to create incident");
      router.push(body.id ? `/incidents/${body.id}` : "/incidents");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create incident");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <main className="content incident-create-page">
        <PageHero
          eyebrow="Manual response intake"
          title="Create security incident"
          description="Open a structured response record with clear priority, occurrence details, confidentiality and escalation requirements."
          icon={Siren}
          actions={<Link href="/incidents" className="btn-secondary"><ArrowLeft size={15} />Back to incidents</Link>}
        />

        {error && <div className="page-alert error">{error}</div>}

        <form className="incident-create-form card" onSubmit={(event) => void submit(event)}>
          <div className="form-section-heading">
            <div><span>Incident details</span><h2>Initial response record</h2></div>
            <p>Fields marked required are needed to open the incident.</p>
          </div>

          <div className="incident-form-grid">
            <label className="incident-field incident-field-wide">
              <span>Incident title *</span>
              <input className="input" value={form.title} onChange={(event) => update("title", event.target.value)} minLength={3} maxLength={200} placeholder="Briefly describe what happened" required />
            </label>
            <label className="incident-field">
              <span>Severity *</span>
              <select className="input" value={form.severity} onChange={(event) => update("severity", event.target.value as IncidentForm["severity"])}>
                <option value="P1">P1 · Critical</option><option value="P2">P2 · High</option><option value="P3">P3 · Medium</option><option value="P4">P4 · Low</option><option value="P5">P5 · Informational</option>
              </select>
            </label>
            <label className="incident-field">
              <span>Incident type</span>
              <select className="input" value={form.incidentType} onChange={(event) => update("incidentType", event.target.value)}>
                <option value="intrusion">Intrusion</option><option value="fire">Fire</option><option value="atm-tampering">ATM tampering</option><option value="tailgating">Tailgating</option><option value="fall-detection">Fall detection</option><option value="other">Other</option>
              </select>
            </label>
            <label className="incident-field">
              <span>Occurred at</span>
              <input className="input" type="datetime-local" value={form.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} />
            </label>
            <label className="incident-field">
              <span>Confidentiality</span>
              <select className="input" value={form.confidentialityLevel} onChange={(event) => update("confidentialityLevel", event.target.value as IncidentForm["confidentialityLevel"])}>
                <option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option><option value="highly-restricted">Highly restricted</option>
              </select>
            </label>
            <label className="incident-field incident-field-wide">
              <span>Description</span>
              <textarea className="input" rows={6} value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={5000} placeholder="Add observations, immediate actions and relevant context" />
            </label>
          </div>

          <div className="incident-requirements">
            <label><input type="checkbox" checked={form.policeRequired} onChange={(event) => update("policeRequired", event.target.checked)} /><span><strong>Police follow-up</strong><small>Flag this incident for police intimation workflow.</small></span></label>
            <label><input type="checkbox" checked={form.insuranceRequired} onChange={(event) => update("insuranceRequired", event.target.checked)} /><span><strong>Insurance follow-up</strong><small>Prepare the record for a potential insurance claim.</small></span></label>
          </div>

          <div className="incident-form-actions">
            <Link href="/incidents" className="btn-secondary">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={submitting || form.title.trim().length < 3}><Save size={15} />{submitting ? "Creating..." : "Create incident"}</button>
          </div>
        </form>
      </main>
    </AppLayout>
  );
}
