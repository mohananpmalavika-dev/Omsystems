import fs from 'node:fs';
// Controls: implementation lanes drive a selected safeguard brief.
let path='dashboard/app/compliance/controls/page.tsx', source=fs.readFileSync(path,'utf8');
source=source.replace("import { useEffect",'import { InspectionDesk } from "@/components/inspection-desk";\nimport { WorkflowNav } from "@/components/workflow-nav";\nimport { useEffect');
source=source.replace("  const [loading, setLoading] = useState(true);","  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);");
source=source.replace('      const data = await response.json();','      if (!response.ok) throw new Error("Unable to load controls.");\n      const data = await response.json();');
source=source.replace("      console.error('Failed to fetch controls:', error);","      setError(error instanceof Error ? error.message : 'Controls unavailable.');");
const end=source.indexOf('\nfunction normalizeImplementationStatus');
source=source.slice(0,source.indexOf('  const typeConfig'))+`  const lanes = [{id:"all",label:"All safeguards"},{id:"not_implemented",label:"To implement"},{id:"in_progress",label:"In progress"},{id:"implemented",label:"To verify"},{id:"verified",label:"Verified"}];
  const priority: Record<string, number> = { not_implemented: 0, in_progress: 1, implemented: 2, verified: 3 };
  const ordered = [...filteredControls].sort((a,b) => priority[a.implementationStatus] - priority[b.implementationStatus]);
  return <main className="assurance-review-page page-container"><header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / SAFEGUARD REVIEW</p><h1>Close the control gap.</h1><p>Move from implementation scope to a safeguard brief. Review ownership, testing and evidence before opening its full record.</p></div><Link href="/compliance/requirements" className="btn-secondary">Review requirements</Link></header><ComplianceHubNav />
    <div className="inspection-toolbar"><WorkflowNav label="Implementation lanes" value={statusFilter} onChange={setStatusFilter} items={lanes.map(lane => ({...lane,count:error || loading ? undefined : controls.filter(control => lane.id === "all" || control.implementationStatus === lane.id).length}))} /></div>
    <div className="assurance-scope"><label className="task-search"><Search size={16} /><input aria-label="Search controls" placeholder="Search safeguard, code or description" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label><label>Control type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All types</option>{["preventive","detective","corrective","deterrent"].map(type => <option key={type} value={type}>{type}</option>)}</select></label></div>
    {error && <p role="alert" className="work-order-form-error">{error}</p>}
    <InspectionDesk label="Safeguard review queue" emptyMessage={loading ? "Loading safeguards…" : error ? "The safeguard register is unavailable." : "No safeguards match these filters."} records={ordered.map(control => ({id:control.id,title:control.title,subtitle:control.controlCode + " · " + control.controlType,status:control.implementationStatus,description:control.description,fields:[{label:"Owner",value:control.owner || "Unassigned"},{label:"Effectiveness",value:control.effectiveness.replaceAll("_"," ")},{label:"Test cadence",value:control.testFrequency || "Not recorded"},{label:"Last tested",value:control.lastTestDate ? new Date(control.lastTestDate).toLocaleDateString() : "Not tested"},{label:"Next test",value:control.nextTestDate ? new Date(control.nextTestDate).toLocaleDateString() : "Not scheduled"},{label:"Evidence",value:control.evidenceCount ?? "Not reported"}],href:"/compliance/controls/"+control.id,actionLabel:control.implementationStatus === "implemented" ? "Review verification" : "Open safeguard"}))} />
  </main>;
}
`+source.slice(end);
fs.writeFileSync(path,source);
// Requirements: browse obligations by category, with an obligation dossier.
path='dashboard/app/compliance/requirements/page.tsx';source=fs.readFileSync(path,'utf8');
source=source.replace('import { FieldVisual } from "@/components/field-visual";','import { InspectionDesk } from "@/components/inspection-desk";\nimport { WorkflowNav } from "@/components/workflow-nav";');
source=source.replace("  const [loading, setLoading] = useState(true);","  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);");
source=source.replace('      const data = await response.json();','      if (!response.ok) throw new Error("Unable to load requirements.");\n      const data = await response.json();');
source=source.replace("      console.error('Failed to fetch requirements:', error);","      setError(error instanceof Error ? error.message : 'Requirements unavailable.');");
source=source.slice(0,source.indexOf('  if (loading)'))+`  return <main className="obligation-library-page page-container"><header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / OBLIGATION LIBRARY</p><h1>Know what must hold.</h1><p>Choose an obligation family. Read its scope and implementation context before working on the requirement.</p></div><Link className="btn-primary" href="/compliance/requirements/new"><Plus size={16} />Add requirement</Link></header>
    {error && <p role="alert" className="work-order-form-error">{error}</p>}
    <div className="obligation-library"><nav className="obligation-categories" aria-label="Requirement categories"><p className="workflow-kicker">OBLIGATION FAMILIES</p>{["all",...categories].map(category => <button key={category} type="button" aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}><strong>{category === "all" ? "Every obligation" : category}</strong><span>{error || loading ? "—" : requirements.filter(record => category === "all" || record.category === category).length}</span></button>)}</nav>
      <div className="obligation-records"><div className="assurance-scope"><label className="task-search"><Search size={16} /><input aria-label="Search requirements" placeholder="Search code, title or scope" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label><WorkflowNav label="Requirement lifecycle" value={statusFilter} onChange={setStatusFilter} items={[{id:"all",label:"All"},{id:"active",label:"Active"},{id:"draft",label:"Draft"},{id:"deprecated",label:"Deprecated"}]} /></div>
        <InspectionDesk label="Obligations" emptyMessage={loading ? "Loading obligations…" : error ? "The obligation library is unavailable." : "No obligations match this scope."} records={filteredRequirements.map(record => ({id:record.id,title:record.title,subtitle:record.requirementCode,status:record.status,description:record.description,fields:[{label:"Category",value:record.category},{label:"Mandatory",value:record.isMandatory ? "Yes" : "No"},{label:"Linked controls",value:record.controlCount ?? "Not reported"},{label:"Implementation",value:record.implementationStatus || "Not reported"},{label:"Subcategory",value:record.subcategory || "Not recorded"}],href:"/compliance/requirements/"+record.id,actionLabel:"Work on obligation"}))} /></div>
    </div>
  </main>;
}
`;
fs.writeFileSync(path,source);
// Assessments: work moves through actual review states; no invented drag-and-drop.
path='dashboard/app/compliance/assessments/page.tsx';source=fs.readFileSync(path,'utf8');
source=source.replace('import { FieldVisual } from "@/components/field-visual";','import Link from "next/link";\nimport { WorkflowNav } from "@/components/workflow-nav";');
source=source.replace("  const [error, setError] = useState<string | null>(null);","  const [error, setError] = useState<string | null>(null);\n  const [feedError, setFeedError] = useState<string | null>(null);");
source=source.replace('      setAssessments(Array.isArray','      setFeedError(null);\n      setAssessments(Array.isArray');
source=source.replace("      console.error('Failed to fetch assessments:', error);","      setFeedError(error instanceof Error ? error.message : 'Assessments unavailable.');");
source=source.replace(/  const getStatusBadgeClass[\s\S]*?  const formatDate/,'  const formatDate');
source=source.replace(/  if \(loading\) \{[\s\S]*?\n  return \(/,'  return (');
const headerStart=source.indexOf('      {/* Header */}'),headerEnd=source.indexOf('      {error &&',headerStart);
source=source.slice(0,headerStart)+`      <header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / ASSESSMENT RUNWAY</p><h1>From review to assurance.</h1><p>Follow the assessment states. Open a review to record findings and advance its actual outcome.</p></div><button className="btn-primary" onClick={handleCreateAssessment}>New assessment</button></header>
      {feedError && <p role="alert" className="work-order-form-error">{feedError}</p>}
`+source.slice(headerEnd);
source=source.slice(0,source.indexOf('      {/* Filters */}'))+`      <WorkflowNav label="Assessment scope" value={status} onChange={value => setStatus(value as AssessmentStatus | '')} items={[{id:"",label:"All reviews"},{id:"incomplete",label:"In progress"},{id:"non-compliant",label:"Action required"},{id:"exception",label:"Exceptions"},{id:"compliant",label:"Assured"}]} />
      {loading ? <div className="workflow-empty">Loading assessment runway…</div> : feedError ? <div className="workflow-empty">Assessment data is unavailable.</div> : <div className="assessment-runway">{([
        {id:"incomplete",title:"01 / In review",hint:"Complete the requirement checks."},
        {id:"non-compliant",title:"02 / Action required",hint:"Resolve the recorded compliance gaps."},
        {id:"exception",title:"03 / Exceptions",hint:"Review accepted exceptions and their context."},
        {id:"compliant",title:"04 / Assured",hint:"Review completed assurance outcomes."}
      ] as const).filter(lane => !status || lane.id === status).map(lane => {
        const records = assessments.filter(record => record.status === lane.id);
        return <section key={lane.id} className="assessment-lane"><header><p className="workflow-kicker">{lane.title}</p><strong>{records.length}</strong><p>{lane.hint}</p></header>{records.length ? records.map(record => <Link key={record.id} href={"/compliance/assessments/"+record.id}><span>{statusLabels[record.status]}</span><h2>{record.frameworkName || "Assessment"}</h2><p>{record.branchName || "Framework scope"}</p><small>{formatDate(record.assessmentPeriodStart)} → {formatDate(record.assessmentPeriodEnd)}</small><dl><div><dt>Compliance</dt><dd>{record.summary?.compliancePercentage == null ? "Not scored" : record.summary.compliancePercentage.toFixed(1)+"%"}</dd></div><div><dt>Requirements met</dt><dd>{record.summary ? (record.summary.compliantRequirements ?? "—")+" / "+(record.summary.totalRequirements ?? "—") : "Not reported"}</dd></div><div><dt>Critical findings</dt><dd>{record.summary?.criticalFindings ?? "Not reported"}</dd></div></dl><b>Open review ↗</b></Link>) : <p className="workflow-empty">No reviews in this state.</p>}</section>;
      })}</div>}
    </div>
  );
}
`;
source=source.replace('className="p-6 max-w-7xl mx-auto"','className="assessment-runway-page page-container"');
fs.writeFileSync(path,source);
