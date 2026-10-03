"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Network, RefreshCw, Search, Server, Unplug, Wifi } from "lucide-react";
import { cameraInventoryApi, edgeAgentBranchesApi } from "@/lib/api-client";
import { branchesInScope, splitVpnNetworks, type AssignmentScope, type BranchConnectionCatalog } from "@/lib/edge-agent-branches";
import styles from "./edge-agent-branch-connections.module.css";

function connectionError(error:unknown) {
  const details=(error as {details?:{error?:string;message?:string}})?.details;
  const code=details?.error;
  if(code==="overlapping_branch_networks") return "Two branches have overlapping VPN addresses. Use distinct routed addresses for each branch on this agent.";
  if(code==="branch_has_agent_cameras") return "This branch has cameras on this agent. Move those cameras before removing its assignment.";
  if(code==="edge_agent_update_required") return "Update the existing agent to enable multiple branches, then refresh this page.";
  return details?.message ?? (error instanceof Error ? error.message : "Unable to save branch connections. Please retry.");
}

export function EdgeAgentBranchConnections() {
  const initialBranchApplied=useRef(false);
  const [catalog,setCatalog]=useState<BranchConnectionCatalog>();
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [agentId,setAgentId]=useState("");
  const [scopeKind,setScopeKind]=useState<AssignmentScope>("branch");
  const [scopeId,setScopeId]=useState("");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [networks,setNetworks]=useState<Record<string,string>>({});
  const [error,setError]=useState<string>();
  const [notice,setNotice]=useState<string>();

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await edgeAgentBranchesApi.catalog();
      setCatalog(response.data);
      setAgentId(current=>response.data.agents.some(a=>a.id===current)?current:response.data.agents[0]?.id??"");
      setError(undefined);
    } catch(err) {setError(connectionError(err));}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const agent=catalog?.agents.find(a=>a.id===agentId);
  useEffect(()=>{
    if(!catalog) return;
    setSelected([]);
    setNetworks(Object.fromEntries(catalog.branches.map(branch=>[branch.id,
      (agent?.branchAssignments.find(a=>a.branchId===branch.id)?.vpnNetworks??branch.vpnNetworks).join(", "),
    ])));
  },[catalog,agent]);
  useEffect(()=>{
    if(!catalog||initialBranchApplied.current) return;
    initialBranchApplied.current=true;
    const requestedBranch=new URLSearchParams(window.location.search).get("branchId");
    if(requestedBranch&&catalog.branches.some(b=>b.id===requestedBranch)) {setScopeKind("branch");setScopeId(requestedBranch);}
  },[catalog]);

  const scopes=useMemo(()=>(scopeKind==="branch"?catalog?.branches:catalog?.scopes)?.filter(n=>n.type===scopeKind)??[],[catalog,scopeKind]);
  const scoped=useMemo(()=>catalog&&scopeId?branchesInScope(catalog.branches,scopeId):[],[catalog,scopeId]);
  const visible=scoped.filter(b=>b.name.toLowerCase().includes(query.toLowerCase())&&b.id!==agent?.branchId);
  const selectable=visible.map(b=>b.id);
  const allSelected=selectable.length>0&&selectable.every(id=>selected.includes(id));
  const connected=(agent?.branchAssignments??[]).map(a=>({...a,name:catalog?.branches.find(b=>b.id===a.branchId)?.name??a.branchId}));
  const canSave=Boolean(agent?.supportsSharedBranches&&scopeId&&selected.length&&selected.every(id=>splitVpnNetworks(networks[id]??"").length>0)&&!busy&&!loading);
  function changeScope(kind:AssignmentScope) {setScopeKind(kind);setScopeId("");setSelected([]);setQuery("");}

  async function save() {
    if(!agent||!canSave) return;
    setBusy(true);setError(undefined);setNotice(undefined);
    try {
      await edgeAgentBranchesApi.assign(agent.id,scopeId,selected.map(branchId=>({branchId,vpnNetworks:splitVpnNetworks(networks[branchId]??"")})));
      setNotice(`${selected.length} branch${selected.length===1?"":"es"} assigned to ${agent.name}. Start discovery to verify reachable devices.`);
      await load();
    } catch(err) {setError(connectionError(err));}
    finally {setBusy(false);}
  }
  async function remove(branchId:string) {
    if(!agent) return;
    setBusy(true);setError(undefined);setNotice(undefined);
    try {await edgeAgentBranchesApi.unassign(agent.id,branchId);setNotice("Branch assignment removed.");await load();}
    catch(err) {setError(connectionError(err));}
    finally {setBusy(false);}
  }
  async function discover(branchId:string) {
    if(!agent) return;
    setBusy(true);setError(undefined);setNotice(undefined);
    try {
      await cameraInventoryApi.startScan(branchId,agent.id);
      setNotice("Discovery queued on this agent. Open branch onboarding to follow progress and review devices.");
    } catch(err) {setError(connectionError(err));}
    finally {setBusy(false);}
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}><Network size={15}/> SHARED EDGE AGENT</span>
        <h1>Connect branches to an existing agent</h1>
        <p>Use one agent at HO, a zone office or a regional office to reach multiple branches over your VPN.</p>
      </div>
      <Link href="/admin/branch-onboarding" className={styles.secondary}>Branch onboarding <ArrowRight size={15}/></Link>
    </header>

    {error&&<div role="alert" className={styles.error}><AlertTriangle size={18}/><span>{error}</span></div>}
    {notice&&<div role="status" className={styles.notice}><CheckCircle2 size={18}/><span>{notice}</span></div>}
    <div className={styles.setup}>
      <section className={styles.card}>
        <div className={styles.title}><span className={styles.step}>1</span><h2>Choose the installed agent</h2>
          <button type="button" onClick={()=>void load()} disabled={loading||busy} className={styles.iconButton} aria-label="Refresh agents"><RefreshCw size={16} className={loading?"animate-spin":""}/></button>
        </div>
        <label htmlFor="shared-agent">Existing edge agent</label>
        <select id="shared-agent" value={agentId} onChange={e=>{setAgentId(e.target.value);setNotice(undefined);}} disabled={busy||loading}>
          <option value="">{loading?"Loading agents…":"Select an agent"}</option>
          {catalog?.agents.map(a=><option key={a.id} value={a.id}>{a.name} · {a.branchName} · {a.status}</option>)}
        </select>
        {agent?<div className={styles.agentSummary}>
          <Server size={22}/><div><strong>{agent.name}</strong><p>Home: {agent.branchName} · v{agent.version}</p>
            <p>{connected.length+1} assigned branch{connected.length?"es":""}</p></div>
          <span className={agent.status==="online"?styles.online:styles.offline}>{agent.status}</span>
        </div>:!loading&&<p className={styles.help}>No existing agent is available in your permitted scope. <Link href="/admin/branch-onboarding">Enroll the HO or regional agent once.</Link></p>}
        {agent&&!agent.supportsSharedBranches&&<p className={styles.warning}>Update this existing agent to v{catalog?.minimumAgentVersion} or newer, then refresh. No separate branch installations are needed.</p>}
        {agent?.status==="offline"&&<p className={styles.help}>Assignments can be saved while the agent is offline. Discovery is available when it reconnects.</p>}
      </section>
      <section className={styles.card}>
        <div className={styles.title}><span className={styles.step}>2</span><h2>Choose branch, region or zone</h2></div>
        <div className={styles.scopeTabs} aria-label="Assignment scope">
          {(["branch","region","zone"] as const).map(kind=><button key={kind} type="button" aria-pressed={scopeKind===kind} onClick={()=>changeScope(kind)} disabled={busy} className={scopeKind===kind?styles.activeTab:""}>{kind}</button>)}
        </div>
        <label htmlFor="shared-scope">{scopeKind.charAt(0).toUpperCase()+scopeKind.slice(1)}</label>
        <select id="shared-scope" value={scopeId} disabled={busy||loading} onChange={e=>{setScopeId(e.target.value);setSelected([]);setQuery("");}}>
          <option value="">Choose a {scopeKind}</option>{scopes.map(scope=><option key={scope.id} value={scope.id}>{scope.name}</option>)}
        </select>
        <p className={styles.help}>Select the branches to assign and enter each branch’s VPN address or subnet. The agent scans those addresses from its installed system.</p>
      </section>
    </div>

    <section className={styles.card}>
      <div className={styles.title}><span className={styles.step}>3</span><h2>Assign VPN branches</h2><span className={styles.count}>{selected.length} selected</span></div>
      <div className={styles.toolbar}><label className={styles.search}><Search size={16}/><input aria-label="Search branches" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this scope"/></label>
        <label className={styles.selectAll}><input type="checkbox" checked={allSelected} disabled={!selectable.length||busy} onChange={e=>setSelected(current=>e.target.checked?[...new Set([...current,...selectable])]:current.filter(id=>!selectable.includes(id)))}/> Select visible branches</label>
      </div>
      <div className={styles.branchList}>
        {visible.map(branch=>{
          const assigned=agent?.branchAssignments.some(a=>a.branchId===branch.id);
          return <div key={branch.id} className={styles.branchRow}>
            <label className={styles.branchName}><input type="checkbox" checked={selected.includes(branch.id)} disabled={busy||!agent} onChange={e=>setSelected(current=>e.target.checked?[...current,branch.id]:current.filter(id=>id!==branch.id))}/><Building2 size={18}/>
              <span><strong>{branch.name}</strong><small>{assigned?"Already assigned · select to update VPN addresses":"Available to assign"}</small></span>
            </label>
            <label className={styles.networkField}><span>VPN IP addresses / CIDRs</span><input aria-label={`VPN addresses for ${branch.name}`} value={networks[branch.id]??""} disabled={busy} onChange={e=>setNetworks(current=>({...current,[branch.id]:e.target.value}))} placeholder="10.20.1.10, 10.20.2.0/24"/></label>
          </div>;
        })}
        {!visible.length&&<div className={styles.empty}><Network size={26}/><p>{loading?"Loading branches…":!scopeId?"Choose a branch, region or zone to see available branches.":scoped.length===1&&scoped[0]?.id===agent?.branchId?"This is the agent’s home branch and is already assigned.":"No branches match this scope and search."}</p></div>}
      </div>
      <footer className={styles.footer}><p>Only selected branches are saved. Use IP addresses that this agent can reach through your existing VPN.</p>
        <button type="button" onClick={()=>void save()} disabled={!canSave} className={styles.primary}><Network size={16}/>{busy?"Working…":`Assign ${selected.length||"selected"} branch${selected.length===1?"":"es"}`}</button>
      </footer>
    </section>

    {agent&&<section className={styles.card}>
      <div className={styles.title}><Wifi size={19}/><h2>Branches assigned to {agent.name}</h2></div>
      <div className={styles.assignedRow}><div><strong>{agent.branchName}</strong><p>Home branch · original installation</p></div><Link href={`/admin/branch-onboarding?branchId=${encodeURIComponent(agent.branchId)}`} className={styles.secondary}>Open onboarding <ArrowRight size={14}/></Link></div>
      {connected.map(branch=><div key={branch.branchId} className={styles.assignedRow}>
        <div><strong>{branch.name}</strong><p>{branch.vpnNetworks.join(", ")}</p></div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} disabled={busy||agent.status!=="online"||!agent.supportsSharedBranches} onClick={()=>void discover(branch.branchId)}>Discover cameras</button>
          <Link href={`/admin/branch-onboarding?branchId=${encodeURIComponent(branch.branchId)}`} className={styles.secondary}>Open onboarding <ArrowRight size={14}/></Link>
          <button type="button" className={styles.iconButton} disabled={busy} aria-label={`Remove ${branch.name} assignment`} title="Remove assignment" onClick={()=>void remove(branch.branchId)}><Unplug size={16}/></button>
        </div>
      </div>)}
      {!connected.length&&<p className={styles.help}>Assign additional branches above to use this installation across your VPN.</p>}
    </section>}
  </main>;
}
