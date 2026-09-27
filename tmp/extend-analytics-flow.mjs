import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const path='dashboard/components/analytics-domain-workspace.tsx';
let source=fs.readFileSync(path,'utf8');
const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const sections=[];let workspace;
const visit=n=>{if(ts.isJsxElement(n)){const tag=n.openingElement.tagName.getText();if(tag==='section')sections.push(n);if(tag==='div'&&n.openingElement.getText().includes('2xl:grid-cols-[1.08fr_.92fr]'))workspace=n;}ts.forEachChild(n,visit)};visit(tree);
const catalog=sections.find(n=>n.getText().includes('CAPABILITY CATALOG'));
const policy=sections.find(n=>n.getText().includes('CAMERA POLICY'));
const signals=sections.find(n=>n.getText().includes('RECENT SIGNALS'));
source=source.slice(0,workspace.getStart())+`<div className="analytics-task-workspace">
  <nav className="analytics-task-rail" aria-label="Analytics tasks"><p className="workflow-kicker">CAMERA INTELLIGENCE</p>{[{id:"configure",title:"Build intelligence",detail:"Choose capabilities for this camera."},{id:"policy",title:"Manage policy",detail:"Review, pause or enable configured rules."},{id:"signals",title:"Read signals",detail:"Inspect events raised by camera rules."},...(domainId === "human" ? [{id:"specialist",title:"Specialist workspaces",detail:"Investigate violence and tailgating."}] : [])].map(task => <button type="button" key={task.id} aria-pressed={taskView === task.id} onClick={() => setTaskView(task.id)}><strong>{task.title}</strong><span>{task.detail}</span><ArrowUpRight size={16} /></button>)}<small>Branch and camera scope stays selected as you switch tasks.</small></nav>
  <div className="analytics-task-canvas"><div hidden={taskView !== "configure"}>${catalog.getText()}</div><div hidden={taskView !== "policy"}>${policy.getText()}</div><div hidden={taskView !== "signals"}>${signals.getText()}</div></div>
</div>`+source.slice(workspace.end);
source=source.replace('  const preset = presets[domainId];','  const [taskView, setTaskView] = useState("configure");\n  const preset = presets[domainId];');
source=source.replace('<section className="mt-8 space-y-8">','<section hidden={taskView !== "specialist"} className="mt-8 space-y-8">');
source=source.replace('onClick={() => void loadRules(cameraId)}','onClick={() => void loadRules(cameraId).catch(error => setMessage({ kind: "error", text: readable(error) }))}');
fs.writeFileSync(path,source);
// Privacy purpose catalogue: select a purpose to inspect its actual governance context.
const privacy='dashboard/app/maintenance/privacy/purposes/page.tsx';
let p=fs.readFileSync(privacy,'utf8');
p=p.replace('import React','import { InspectionDesk } from "@/components/inspection-desk";\nimport React').replace('ModulePage, ModuleStatus','ModulePage');
p=p.replace('      eyebrow="Privacy governance"','      presentation="registry"\n      eyebrow="Privacy governance"');
const start=p.indexOf('      <div className="module-table-wrap">'),end=p.indexOf('    </ModulePage>',start);
p=p.slice(0,start)+`      <InspectionDesk label="Processing purpose library" records={purposes.map(purpose => ({id:purpose.id,title:purpose.name,subtitle:purpose.lawfulBasis,status:purpose.active ? "active" : "inactive",description:purpose.description,fields:[{label:"Lawful basis",value:purpose.lawfulBasis || "Not recorded"},{label:"Risk level",value:purpose.riskLevel || "Unrated"},{label:"Data categories",value:Array.isArray(purpose.dataCategories) ? purpose.dataCategories.join(", ") || "Not recorded" : "Not recorded"},{label:"Available for use",value:purpose.active ? "Yes" : "No"}]}))} />
`+p.slice(end);
fs.writeFileSync(privacy,p);
