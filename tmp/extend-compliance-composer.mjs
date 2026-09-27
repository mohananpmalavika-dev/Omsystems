import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const path='dashboard/components/compliance/compliance-create-form.tsx';
let source=fs.readFileSync(path,'utf8');
const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let form,grid;const tag=n=>ts.isJsxElement(n)?n.openingElement.tagName.getText():'';
const visit=n=>{if(tag(n)==='form')form=n;if(tag(n)==='div'&&n.openingElement.getText().includes('compliance-form-grid'))grid=n;ts.forEachChild(n,visit)};visit(tree);
const fields=grid.children.filter(n=>!ts.isJsxText(n));
const footer=form.children.find(n=>tag(n)==='footer');
const notice=form.children.find(n=>ts.isJsxExpression(n));
const output=`<RecordComposer onSubmit={submit} busy={submitting} notices={<>${notice.getText()}</>} chapters={[
 { title: "Definition", description: "Connect the record to its framework and explain its scope.", content: <>${fields.slice(0,5).map(n=>n.getText()).join('\n')}</> },
 { title: isRequirement ? "Accountability" : "Exposure & treatment", description: isRequirement ? "Set the control, owner and evidence expectations." : "Assess likelihood and impact, then define the response.", content: <>${fields.slice(5).map(n=>n.getText()).join('\n')}</> }
]} footer={${footer.getText()}} />`;
source=source.slice(0,form.getStart())+output+source.slice(form.end);
source=source.replace('import Link','import { RecordComposer } from "@/components/record-composer";\nimport Link');
fs.writeFileSync(path,source);
