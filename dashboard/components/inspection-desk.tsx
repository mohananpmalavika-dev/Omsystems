"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, ScanLine } from "lucide-react";
import Link from "next/link";

export type InspectionRecord = {
  id: string; title: string; subtitle?: string; status: string; measure?: string;
  description?: string; fields: { label: string; value: ReactNode }[];
  href?: string; actionLabel?: string; actions?: ReactNode;
};

export function InspectionDesk({ records, label, emptyMessage = "No records match this scope." }: { records: InspectionRecord[]; label: string; emptyMessage?: string }) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = records.find(record => record.id === selectedId) ?? records[0];
  return <div className="inspection-desk">
    <section className="inspection-index" aria-label={label}><header><p className="workflow-kicker">SELECT / INSPECT / ACT</p><h2>{label}</h2><span>{records.length} in this scope</span></header>
      {records.length ? <div className="inspection-records">{records.map(record => <button key={record.id} type="button" aria-pressed={selected?.id === record.id} onClick={() => setSelectedId(record.id)}>
        <span className="inspection-status" data-status={record.status}>{record.status.replaceAll("_", " ")}</span><div><strong>{record.title}</strong><small>{record.subtitle}</small></div><b>{record.measure ?? "↗"}</b>
      </button>)}</div> : <div className="workflow-empty"><ScanLine size={32} /><p>{emptyMessage}</p></div>}
    </section>
    <aside className="inspection-brief" aria-label="Selected record"><p className="workflow-kicker">INSPECTION BRIEF</p>{selected ? <>
      <span className="inspection-status" data-status={selected.status}>{selected.status.replaceAll("_", " ")}</span><h2>{selected.title}</h2><p>{selected.description || selected.subtitle}</p>
      <dl>{selected.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value ?? "Not recorded"}</dd></div>)}</dl>
      {selected.href && <Link className="inspection-action" href={selected.href}>{selected.actionLabel ?? "Open full record"}<ArrowUpRight size={17} /></Link>}{selected.actions}
    </> : <><ScanLine size={56} /><h2>Choose a record.</h2><p>The selected record’s context and next action appear here.</p></>}</aside>
  </div>;
}
