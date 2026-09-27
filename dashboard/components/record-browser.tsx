"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ModuleStatus } from "@/components/module-page";

export type BrowseRecord = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  href: string;
  fields: { label: string; value?: string | null }[];
  actionHref?: string;
  actionLabel?: string;
};

export function RecordBrowser({ records, label, icon: Icon = Boxes }: { records: BrowseRecord[]; label: string; icon?: LucideIcon }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = records.find(record => record.id === selectedId) ?? records[0];
  return <div className="record-browser">
    <section className="record-browser-index" aria-label={label}><header><p className="workflow-kicker">REGISTRY / {records.length} MATCHING RECORDS</p><span>Select a record to inspect its identity and lifecycle.</span></header><div>{records.map(record=><button type="button" key={record.id} aria-pressed={selected?.id===record.id} onClick={()=>setSelectedId(record.id)}><Icon size={20}/><div><strong>{record.title}</strong><small>{record.subtitle}</small></div>{record.status&&<ModuleStatus value={record.status}/>}<ArrowRight size={15}/></button>)}</div>{records.length===0&&<div className="workflow-empty"><strong>No matching records</strong><p>Adjust the search or filters to continue.</p></div>}</section>
    {selected&&<aside className="record-browser-detail" aria-label="Selected record details"><p className="workflow-kicker">RECORD / {selected.id}</p><div className="record-browser-emblem"><Icon size={35}/></div>{selected.status&&<ModuleStatus value={selected.status}/>}<h2>{selected.title}</h2><p>{selected.subtitle}</p><dl>{selected.fields.map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.value||"Not recorded"}</dd></div>)}</dl><Link className="btn-primary" href={selected.href}>Open full record<ArrowRight size={15}/></Link>{selected.actionHref&&<Link className="record-browser-action" href={selected.actionHref}>{selected.actionLabel}<ArrowRight size={14}/></Link>}</aside>}
  </div>;
}
