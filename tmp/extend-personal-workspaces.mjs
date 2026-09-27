import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
function parse(path){const source=fs.readFileSync(path,'utf8'),tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let main;const visit=n=>{if(ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='main')main=n;ts.forEachChild(n,visit)};visit(tree);return {source,main};}
function apply(source,edits){for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);return source;}
const account='dashboard/app/account/security/page.tsx';
let {source,main}=parse(account);
const sections=main.children.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='section');
const modes=['identity','credentials','preferences','sessions','sessions'];
const edits=sections.map((node,index)=>({start:node.getStart(),end:node.end,text:`<div hidden={accountTask !== "${modes[index]}"} className="personal-task-panel">${node.getText()}</div>`}));
const voice=main.children.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='VoiceEnrollmentCard');
edits.push({start:voice.getStart(),end:voice.end,text:`<div hidden={accountTask !== "voice"} className="personal-task-panel">${voice.getText()}</div>`});
const hero=main.children.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='PageHero');
edits.push({start:hero.end,end:hero.end,text:`\n<WorkflowNav label="Account tasks" value={accountTask} onChange={setAccountTask} items={[{id:"identity",label:"Identity"},{id:"credentials",label:"Password & protection"},{id:"preferences",label:"Alert preferences"},{id:"sessions",label:"Devices & sessions"},{id:"voice",label:"Voice identity"}]} />`});
source=apply(source,edits).replace('import { useCallback','import { WorkflowNav } from "@/components/workflow-nav";\nimport { useCallback');
const name=source.match(/export default function (\w+)\([^)]*\) \{/)[0];
source=source.replace(name,name+'\n  const [accountTask, setAccountTask] = useState("identity");');
fs.writeFileSync(account,source);
// Support task chooser keeps the manual and escalation focused on the selected intent.
const support='dashboard/app/support/page.tsx';({source,main}=parse(support));
const panels=main.children.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='section');
const supportModes=['diagnose','guide','escalate'];
const supportEdits=panels.map((node,index)=>({start:node.getStart(),end:node.end,text:`<div hidden={supportTask !== "${supportModes[index]}"} className="personal-task-panel">${node.getText()}</div>`}));
const supportHero=main.children.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='PageHero');
supportEdits.push({start:supportHero.end,end:supportHero.end,text:`\n<WorkflowNav label="Support tasks" value={supportTask} onChange={setSupportTask} items={[{id:"diagnose",label:"Resolve an issue"},{id:"guide",label:"Find a page workflow"},{id:"escalate",label:"Prepare an escalation"}]} />`});
source=apply(source,supportEdits).replace('import Link','import { WorkflowNav } from "@/components/workflow-nav";\nimport Link').replace('export default function SupportPage() {','export default function SupportPage() {\n  const [supportTask, setSupportTask] = useState("diagnose");');
fs.writeFileSync(support,source);
// Composer headings: let the actual workflow carry the visual identity.
for(const file of ['assets','amc','vendors']){const path=`dashboard/app/maintenance/${file}/new/page.tsx`;let s=fs.readFileSync(path,'utf8');s=s.replace('import { FieldVisual } from "@/components/field-visual";\n','').replace('<FieldVisual />','').replace('record-form-hero workspace-heading','workflow-heading composer-heading');fs.writeFileSync(path,s);}
