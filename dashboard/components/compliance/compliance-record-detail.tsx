"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHero } from "@/components/page-hero";

type RecordKind = "requirements" | "controls" | "findings" | "risks";

const kindMeta: Record<RecordKind, { singular: string; listLabel: string }> = {
  requirements: { singular: "Requirement", listLabel: "Requirements" },
  controls: { singular: "Control", listLabel: "Controls" },
  findings: { singular: "Finding", listLabel: "Findings" },
  risks: { singular: "Risk", listLabel: "Risk register" },
};

export function ComplianceRecordDetail({ kind, id }: { kind: RecordKind; id: string }) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meta = kindMeta[kind];

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/control/v1/compliance/${kind}/${encodeURIComponent(id)}`, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? `${meta.singular} was not found.` : `Unable to load ${meta.singular.toLowerCase()}.`);
      const body = await response.json();
      setRecord((body.data ?? body) as Record<string, unknown>);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to load ${meta.singular.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [id, kind, meta.singular]);

  useEffect(() => { void loadRecord(); }, [loadRecord]);

  const title = useMemo(() => {
    if (!record) return meta.singular;
    return String(record.title ?? record.riskTitle ?? record.controlName ?? record.name ?? meta.singular);
  }, [meta.singular, record]);

  const entries = useMemo(() => Object.entries(record ?? {}).filter(([key, value]) =>
    !["id", "tenantId", "metadata"].includes(key) && value !== null && value !== undefined && value !== ""
  ), [record]);

  return (
    <main className="compliance-record-page">
      <PageHero
        eyebrow="Assurance record"
        title={title}
        description={`Review the complete ${meta.singular.toLowerCase()} record, ownership, status, and supporting context.`}
        icon={ShieldCheck}
        actions={<Link href={`/compliance/${kind}`} className="btn-secondary"><ArrowLeft size={15} /> Back to {meta.listLabel}</Link>}
      />

      {loading ? (
        <section className="compliance-record-state"><RefreshCw className="animate-spin" size={24} /><strong>Loading {meta.singular.toLowerCase()}</strong></section>
      ) : error ? (
        <section className="compliance-record-state error"><strong>{error}</strong><button type="button" className="btn-secondary" onClick={() => void loadRecord()}><RefreshCw size={14} /> Try again</button></section>
      ) : (
        <section className="compliance-record-panel">
          <header><div><span>Record ID</span><strong>{id}</strong></div><em>{String(record?.status ?? "active").replaceAll("_", " ")}</em></header>
          <div className="compliance-record-grid">
            {entries.map(([key, value]) => (
              <article key={key} className={typeof value === "string" && value.length > 100 ? "wide" : undefined}>
                <span>{humanize(key)}</span>
                <strong>{formatValue(value)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value) return JSON.stringify(value, null, 2);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return String(value).replaceAll("_", " ");
}
