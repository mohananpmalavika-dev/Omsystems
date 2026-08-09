"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileCheck2, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PageHero } from "@/components/page-hero";

type CreateKind = "requirement" | "risk";
type Framework = { id: string; name?: string; frameworkName?: string; code?: string };

export function ComplianceCreateForm({ kind }: { kind: CreateKind }) {
  const router = useRouter();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRequirement = kind === "requirement";
  const listHref = isRequirement ? "/compliance/requirements" : "/compliance/risks";

  useEffect(() => {
    void fetch("/api/control/v1/compliance/frameworks", { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body) => setFrameworks(body.data ?? []))
      .catch(() => setFrameworks([]));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = isRequirement ? {
      frameworkId: data.get("frameworkId"),
      requirementCode: data.get("recordNumber"),
      title: data.get("title"),
      description: data.get("description"),
      category: data.get("category") || undefined,
      controlType: data.get("controlType") || undefined,
      isMandatory: data.get("isMandatory") === "on",
      evidenceRequired: data.get("evidenceRequired") === "on",
      ownerRole: data.get("owner" ) || undefined,
      status: data.get("status"),
    } : {
      frameworkId: data.get("frameworkId") || undefined,
      riskNumber: data.get("recordNumber"),
      riskTitle: data.get("title"),
      riskDescription: data.get("description"),
      riskCategory: data.get("category") || undefined,
      inherentLikelihood: data.get("likelihood"),
      inherentImpact: data.get("impact"),
      riskTreatment: data.get("riskTreatment"),
      treatmentPlan: data.get("treatmentPlan") || undefined,
      status: data.get("status"),
    };

    try {
      const plural = isRequirement ? "requirements" : "risks";
      const response = await fetch(`/api/control/v1/compliance/${plural}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? `Unable to create ${kind}.`);
      router.push(`${listHref}/${body.id ?? body.data?.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to create ${kind}.`);
      setSubmitting(false);
    }
  };

  const Icon = isRequirement ? FileCheck2 : AlertTriangle;
  return (
    <main className="compliance-create-page">
      <PageHero
        eyebrow="Assurance workflow"
        title={`Add ${kind}`}
        description={isRequirement ? "Register a measurable obligation and connect it to an assurance framework." : "Document exposure, assess inherent impact, and define the treatment response."}
        icon={Icon}
        actions={<Link href={listHref} className="btn-secondary"><ArrowLeft size={15} /> Cancel</Link>}
      />
      <form className="compliance-create-form" onSubmit={submit}>
        {error && <div className="compliance-form-error" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}
        <section>
          <header><span>Core details</span><h2>{isRequirement ? "Requirement definition" : "Risk definition"}</h2></header>
          <div className="compliance-form-grid">
            <label><span>{isRequirement ? "Framework" : "Framework (optional)"}</span><select name="frameworkId" required={isRequirement} defaultValue=""><option value="">Select a framework</option>{frameworks.map((framework) => <option key={framework.id} value={framework.id}>{framework.name ?? framework.frameworkName ?? framework.code ?? framework.id}</option>)}</select></label>
            <label><span>{isRequirement ? "Requirement code" : "Risk number"}</span><input name="recordNumber" required maxLength={100} placeholder={isRequirement ? "ISO-A.8.1" : "RISK-2026-001"} /></label>
            <label className="wide"><span>Title</span><input name="title" required minLength={2} maxLength={500} placeholder={`Enter ${kind} title`} /></label>
            <label className="wide"><span>Description</span><textarea name="description" required rows={5} placeholder={`Describe the ${kind}, scope, and operational context`} /></label>
            <label><span>Category</span>{isRequirement ? <input name="category" maxLength={200} placeholder="Access control" /> : <select name="category" defaultValue="compliance"><option value="operational">Operational</option><option value="compliance">Compliance</option><option value="financial">Financial</option><option value="reputational">Reputational</option><option value="strategic">Strategic</option><option value="technology">Technology</option><option value="third_party">Third party</option><option value="legal">Legal</option></select>}</label>
            {isRequirement ? <label><span>Control type</span><select name="controlType" defaultValue="preventive"><option value="preventive">Preventive</option><option value="detective">Detective</option><option value="corrective">Corrective</option><option value="compensating">Compensating</option><option value="directive">Directive</option></select></label> : <><label><span>Likelihood</span><RiskScale name="likelihood" /></label><label><span>Impact</span><RiskScale name="impact" /></label><label><span>Treatment</span><select name="riskTreatment" defaultValue="mitigate"><option value="mitigate">Mitigate</option><option value="accept">Accept</option><option value="transfer">Transfer</option><option value="avoid">Avoid</option></select></label><label className="wide"><span>Treatment plan</span><textarea name="treatmentPlan" rows={3} placeholder="Describe planned controls and accountable actions" /></label></>}
            {isRequirement && <label><span>Owner role</span><input name="owner" maxLength={200} placeholder="Compliance manager" /></label>}
            <label><span>Status</span><select name="status" defaultValue={isRequirement ? "active" : "identified"}>{isRequirement ? <><option value="active">Active</option><option value="draft">Draft</option><option value="deprecated">Deprecated</option><option value="archived">Archived</option></> : <><option value="identified">Identified</option><option value="assessed">Assessed</option><option value="treated">Treated</option><option value="monitored">Monitored</option><option value="closed">Closed</option></>}</select></label>
            {isRequirement && <div className="compliance-form-checks"><label><input type="checkbox" name="isMandatory" defaultChecked /> Mandatory</label><label><input type="checkbox" name="evidenceRequired" defaultChecked /> Evidence required</label></div>}
          </div>
        </section>
        <footer><Link href={listHref} className="btn-secondary">Cancel</Link><button type="submit" className="btn-primary" disabled={submitting}><Save size={15} /> {submitting ? "Saving…" : `Create ${kind}`}</button></footer>
      </form>
    </main>
  );
}

function RiskScale({ name }: { name: string }) {
  return <select name={name} defaultValue="medium"><option value="negligible">Negligible</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>;
}
