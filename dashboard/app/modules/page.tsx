"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Search,
} from "lucide-react";
import { AppLayout, getVisibleNavigation, menuKey, quickActions, type MenuAccessUser } from "@/components/app-layout";
import { WorkflowNav } from "@/components/workflow-nav";
import { filterAuthorizedQuickActions } from "@/lib/module-directory-access";
import { authApi } from "@/lib/api-client";

const missions = [
  {id:"watch",title:"Watch the estate",verb:"Observe",description:"Start with live coverage, check device continuity, then review the signals that need attention.",routes:["/control-room","/operations/cameras","/analytics/alerts"]},
  {id:"investigate",title:"Follow an event",verb:"Investigate",description:"Search for the moment, replay the context, and preserve the evidence.",routes:["/video-search","/playback/synced","/evidence"]},
  {id:"restore",title:"Restore readiness",verb:"Recover",description:"Identify the affected hardware, coordinate service, and verify recording continuity.",routes:["/maintenance/assets","/maintenance/workorders","/operations/recording"]},
  {id:"assure",title:"Prepare for assurance",verb:"Prove",description:"Review your controls, collect supporting evidence, and inspect branch audit readiness.",routes:["/compliance","/compliance/evidence","/audit/branch-compliance"]},
  {id:"expand",title:"Bring a branch online",verb:"Connect",description:"Set up the branch, activate its gateway, and import its cameras.",routes:["/admin/branch-onboarding","/admin/zero-touch","/admin/camera-import-export"]},
];

const groupDescriptions: Record<string, string> = {
  WORKSPACE: "Start with the NBFC operating playbook, then use the full directory only when a specialist workflow is required.",
  COMMUNICATIONS: "Branch voice calling, SOC operator voice dispatch, employee phone directory, and KryptoVision Connect device enrollment.",
  OPERATIONS: "Live control room, branch fleet, alert dispatch, incident response, and media streaming pipeline.",
  "DEVICE HEALTH & MAINTENANCE": "Camera, recorder, storage, gateway, power, and network health with diagnostics and recovery tools.",
  "INVESTIGATE & PLAYBACK": "AI semantic video search, synchronized multi-camera playback, recording archives, and chain of custody evidence.",
  "INTELLIGENCE & AI": "Real-time AI command center, facial recognition, ANPR, crowd density, banking/industrial safety, and 3D digital twins.",
  "FLEET MAINTENANCE": "Hardware asset tracking, field work orders, vendor directory, AMC contracts, and predictive failure care.",
  "COMPLIANCE & GOVERNANCE": "Compliance frameworks, control assessments, risk management, evidence, and privacy governance.",
  "AUDIT & REPORTING": "Executive morning digest, branch CCTV audits, camera health compliance, and immutable operator access logs.",
  ADMINISTRATION: "Tenants, RBAC permissions, zero-touch branch onboarding, AI quality registry, HA topology, and system management.",
};

export default function ModulesPage() {
  const [view, setView] = useState("missions");
  const [missionId, setMissionId] = useState("watch");
  const [groupId, setGroupId] = useState("");
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<MenuAccessUser | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadUser = useCallback(() => {
    setLoading(true);
    setSessionError(null);
    authApi.getCurrentUser()
      .then((data) => setUser((data as any)?.user ?? data ?? null))
      .catch((error) => {
        setUser(null);
        setSessionError(error instanceof Error ? error.message : "Unable to load your module access.");
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadUser(); }, [loadUser]);

  // Never fall back to an assumed operator role while identity is unresolved.
  // That can briefly advertise workflows belonging to a previous session.
  const visibleNavigation = useMemo(() => user ? getVisibleNavigation(user) : [], [user]);
  const visibleHrefs = useMemo(() => new Set(visibleNavigation.flatMap((group) => group.items.map(menuKey))), [visibleNavigation]);
  const visibleQuickActions = useMemo(
    () => filterAuthorizedQuickActions(quickActions, visibleHrefs),
    [visibleHrefs],
  );
  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visibleNavigation;
    return visibleNavigation
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${group.label} ${item.label} ${item.href}`.toLowerCase().includes(normalized)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query, visibleNavigation]);
  const moduleCount = visibleNavigation.reduce((total, group) => total + group.items.length, 0);
  const visibleCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);

  const availableMissions = missions.map(mission => ({...mission, steps:mission.routes.flatMap(href => {
    const item=visibleNavigation.flatMap(group=>group.items).find(item=>item.href===href);
    return item&&visibleHrefs.has(menuKey(item))?[item]:[];
  })})).filter(mission=>mission.steps.length>0);
  const selectedMission = availableMissions.find(mission=>mission.id===missionId)??availableMissions[0];
  const selectedGroup = filteredGroups.find(group=>group.label===groupId)??filteredGroups[0];

  return (
    <AppLayout>
      <div className="module-directory-page">
        <header className="workflow-heading launchpad-heading"><div><p className="workflow-kicker">WORKSPACE / LAUNCHPAD</p><h1>What’s the<br/><em>mission today?</em></h1><p>Choose the outcome. Find the tools that move it forward.</p></div><div className="launchpad-index"><strong>{loading?"…":moduleCount}</strong><span>tools in your workspace</span></div></header>
        <div className="launchpad-toolbar"><WorkflowNav label="Navigation mode" value={view} onChange={setView} items={[{id:"missions",label:"By mission"},{id:"catalog",label:"All tools"}]} /><div className="directory-search"><Search size={18}/><input aria-label="Search available modules" disabled={loading} value={query} onChange={event=>{setQuery(event.target.value);setView("catalog");}} placeholder="Find a tool or workflow"/></div></div>
        {sessionError && (
          <div className="directory-empty" role="alert">
            <strong>{sessionError}</strong>
            {user === null && sessionError.startsWith("Sign in")
              ? <Link href="/login?next=%2Fmodules">Sign in</Link>
              : <button type="button" onClick={loadUser}>Retry</button>}
          </div>
        )}

        {!sessionError && <>
          {loading?<div className="directory-empty" role="status">Loading your authorized workflows…</div>:<>
            <section hidden={view!=="missions"} className="mission-workspace">
              <div className="mission-selector" aria-label="Choose a mission">{availableMissions.map((mission,index)=><button type="button" key={mission.id} aria-pressed={selectedMission?.id===mission.id} onClick={()=>setMissionId(mission.id)}><span>{String(index+1).padStart(2,"0")}</span><div><small>{mission.verb}</small><strong>{mission.title}</strong></div><ArrowUpRight size={20}/></button>)}</div>
              {selectedMission?<article className="mission-route"><p className="workflow-kicker">YOUR SUGGESTED ROUTE / {selectedMission.verb.toUpperCase()}</p><h2>{selectedMission.title}</h2><p>{selectedMission.description}</p><div className="mission-route-stops">{selectedMission.steps.map((item,index)=>{const Icon=item.icon;return <Link href={item.href} key={item.href}><span className="mission-stop-number">{String(index+1).padStart(2,"0")}</span><Icon size={23}/><div><small>{index===0?"Start here":"Then explore"}</small><strong>{item.label}</strong></div><ArrowUpRight size={20}/></Link>;})}</div><small className="mission-route-note">Open any stop directly. Only tools available to your role appear here.</small></article>:<div className="directory-empty"><strong>No mission shortcuts available</strong><button className="btn-secondary" onClick={()=>setView("catalog")}>Browse your available tools</button></div>}
            </section>
            <section hidden={view!=="catalog"} className="tool-browser">
              <nav className="tool-area-selector" aria-label="Business areas"><p className="workflow-kicker">AREAS / {visibleCount} TOOLS</p>{filteredGroups.map(group=><button key={group.label} type="button" aria-pressed={selectedGroup?.label===group.label} onClick={()=>setGroupId(group.label)}>{group.label}<span>{group.items.length}</span></button>)}</nav>
              {selectedGroup?<article className="tool-area-content"><header><p className="workflow-kicker">EXPLORE THE WORKSPACE</p><h2>{selectedGroup.label}</h2><p>{groupDescriptions[selectedGroup.label]}</p></header><div className="tool-area-list">{selectedGroup.items.map(item=>{const Icon=item.icon;return <Link href={item.href} key={item.href}><Icon size={20}/><strong>{item.label}</strong><ArrowUpRight size={17}/></Link>;})}</div></article>:<div className="directory-empty"><Search size={28}/><strong>No modules found</strong><span>Try camera, audit, incident or maintenance.</span></div>}
            </section>
            <section className="launchpad-quick-actions"><p className="workflow-kicker">QUICK CREATE</p><div>{visibleQuickActions.map(action=>{const Icon=action.icon;return <Link href={action.href} key={action.href}><Icon size={16}/>{action.label}<ArrowUpRight size={13}/></Link>;})}{visibleQuickActions.length===0&&<p>No quick-create actions are available to your role.</p>}</div></section>
          </>}
        </>}

      </div>
    </AppLayout>
  );
}
