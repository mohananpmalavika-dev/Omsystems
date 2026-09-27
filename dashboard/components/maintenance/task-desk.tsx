"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Wrench } from "lucide-react";
import { WorkflowNav } from "@/components/workflow-nav";

export type MaintenanceTask = {
  id: string;
  title: string;
  description: string;
  kind: "Alert" | "Asset risk" | "Work order";
  priority: string;
  reference: string;
  href: string;
  actionLabel: string;
  assetId?: string;
  status?: string;
  owner?: string;
  dueAt?: string;
};

export function MaintenanceTaskDesk({ tasks, loading, unavailable }: { tasks: MaintenanceTask[]; loading: boolean; unavailable: boolean }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const visible = tasks.filter(task => (filter === "all" || (filter === "urgent" ? ["critical", "high"].includes(task.priority.toLowerCase()) : task.kind === "Work order")) && `${task.title} ${task.reference} ${task.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = visible.find(task => task.id === selectedId) ?? visible[0];
  return <div className="maintenance-task-desk">
    <section className="maintenance-task-feed" aria-busy={loading}>
      <header><p className="workflow-kicker">TRIAGE / SELECT THE NEXT ACTION</p><h2>Attention queue</h2><p>Alerts, asset risk and open service work, ordered by priority.</p></header>
      <WorkflowNav label="Filter maintenance queue" value={filter} onChange={setFilter} items={[{id:"all",label:"All tasks"},{id:"urgent",label:"Urgent"},{id:"work",label:"Service work"}]} />
      <label className="task-search"><Search size={16}/><input aria-label="Search maintenance tasks" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find an asset, problem or order"/></label>
      <div className="maintenance-task-list">
        {loading?<div className="workflow-empty" role="status">Loading the attention queue…</div>:visible.map(task=><button key={task.id} type="button" aria-pressed={selected?.id===task.id} onClick={()=>setSelectedId(task.id)}><span className={`task-priority task-priority-${task.priority.toLowerCase()}`}/><div><small>{task.kind} / {task.reference}</small><strong>{task.title}</strong><span>{task.status||task.priority}</span></div><ArrowRight size={17}/></button>)}
        {!loading&&visible.length===0&&<div className="workflow-empty"><Wrench size={28}/><strong>{tasks.length?"No matching tasks":unavailable?"Attention feed unavailable":"No attention items in the current feed"}</strong><p>{tasks.length?"Try another filter or search term.":unavailable?"Restore the data connection to review maintenance priorities.":"Create a work order or explore fleet health to plan your next visit."}</p></div>}
      </div>
    </section>
    <aside className="maintenance-task-inspector" aria-label="Selected maintenance task">
      {selected?<><p className="workflow-kicker">ACTION BRIEF / {selected.kind.toUpperCase()}</p><span className={`module-priority ${selected.priority.toLowerCase()}`}>{selected.priority}</span><h2>{selected.title}</h2><p>{selected.description}</p><dl><div><dt>Reference</dt><dd>{selected.reference}</dd></div>{selected.assetId&&<div><dt>Asset</dt><dd>{selected.assetId}</dd></div>}{selected.owner&&<div><dt>Assigned to</dt><dd>{selected.owner}</dd></div>}{selected.dueAt&&<div><dt>SLA due</dt><dd>{new Date(selected.dueAt).toLocaleString()}</dd></div>}</dl><Link className="btn-primary" href={selected.href}>{selected.actionLabel}<ArrowRight size={16}/></Link>{selected.kind!=="Work order"&&<Link className="task-follow-up" href={`/maintenance/workorders/new${selected.assetId?`?assetId=${encodeURIComponent(selected.assetId)}`:""}`}>Create a work order for this issue<ArrowRight size={14}/></Link>}</>:<><p className="workflow-kicker">ACTION BRIEF</p><div className="task-inspector-graphic" aria-hidden="true"><Wrench size={42}/></div><h2>One issue.<br/>A clear next move.</h2><p>Select a task to inspect its context and open the right action.</p><Link href="/maintenance/workorders/new" className="btn-secondary">Plan service work<ArrowRight size={15}/></Link></>}
    </aside>
  </div>;
}
