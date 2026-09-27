import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const path='dashboard/app/incidents/create/page.tsx';let source=fs.readFileSync(path,'utf8');
const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let form,grid,requirements,actions;
const visit=n=>{if(ts.isJsxElement(n)){const text=n.openingElement.getText();if(n.openingElement.tagName.getText()==='form')form=n;if(text.includes('incident-form-grid'))grid=n;if(text.includes('incident-requirements'))requirements=n;if(text.includes('incident-form-actions'))actions=n;}ts.forEachChild(n,visit)};visit(tree);
const fields=grid.children.filter(n=>ts.isJsxElement(n));
const replacement=`<RecordComposer onSubmit={submit} busy={submitting} chapters={[
 {title:"Event & priority",description:"Describe the event and choose its response priority.",content:<>${fields.slice(0,3).map(n=>n.getText()).join('\n')}${fields[6].getText()}</>},
 {title:"Scope & timing",description:"Place the incident in its branch, time and confidentiality context.",content:<>${fields.slice(3,6).map(n=>n.getText()).join('\n')}</>},
 {title:"Follow-up",description:"Flag any police or insurance follow-up needed by the response team.",content:<>${requirements.getText()}</>}
]} footer={${actions.getText()}} />`;
source=source.slice(0,form.getStart())+replacement+source.slice(form.end);
source=source.replace('import Link','import { RecordComposer } from "@/components/record-composer";\nimport Link');
fs.writeFileSync(path,source);
