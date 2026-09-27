import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const configs = [
 ['app/maintenance/assets/new/page.tsx',6,10,['Identity','Deployment','Lifecycle'],['Identify the hardware that joins your fleet.','Place the asset and connect its service ownership.','Record the dates and context for its service life.'],'loading'],
 ['app/maintenance/amc/new/page.tsx',6,9,['Agreement','Coverage','Service commitments'],['Set the partner, contract window and value.','Define what the agreement protects and excludes.','Capture service expectations and renewal arrangements.'],'loading'],
 ['app/maintenance/vendors/new/page.tsx',1,4,['Partner','Escalation contact','Service footprint'],['Name the service partner.','Keep the people and channels needed for escalation together.','Record the service centres available to your team.'],'loading'],
 ['app/maintenance/privacy/purposes/new/page.tsx',3,6,['Processing purpose','Safeguards'],['Explain why this processing is needed and its lawful basis.','Define the risk, data categories and policy availability.'],'submitting'],
 ['app/maintenance/privacy/breaches/new/page.tsx',2,6,['Affected scope','Event & impact','Response'],['Identify the branch and camera when known.','Record the breach, discovery time and immediate impact.','Document the planned containment and prevention.'],'submitting'],
];
const tag=n=>ts.isJsxElement(n)?n.openingElement.tagName.getText():'';
for (const [file,a,b,titles,descriptions,busy] of configs) {
 const path='dashboard/'+file, source=fs.readFileSync(path,'utf8');
 if(source.includes('import { RecordComposer }')) throw Error('Already migrated '+file);
 const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let form; const visit=n=>{if(tag(n)==='form')form=n;ts.forEachChild(n,visit)};visit(tree);
 const kids=form.children.filter(n=>!ts.isJsxText(n));
 const grid=kids.find(n=>tag(n)==='div'&&n.openingElement.getText().includes('work-order-form-grid'));
 const fields=(grid?grid.children:kids).filter(n=>tag(n)==='label'||tag(n)==='div'&&n.getText().includes('<label'));
 const footer=kids.find(n=>tag(n)==='footer'||tag(n)==='button');
 const notices=kids.filter(n=>n!==grid&&!fields.includes(n)&&n!==footer).map(n=>n.getText()).join('\n');
 const bounds=titles.length===2?[0,a,fields.length]:[0,a,b,fields.length];
 const chapters=titles.map((title,i)=>`{ title: ${JSON.stringify(title)}, description: ${JSON.stringify(descriptions[i])}, content: <>${fields.slice(bounds[i],bounds[i+1]).map(n=>n.getText()).join('\n')}</> }`);
 const replacement=`<RecordComposer onSubmit={handleSubmit} busy={${busy}} chapters={[${chapters.join(',\n')}]} notices={<>${notices}</>} footer={${footer.getText()}} />`;
 let output=source.slice(0,form.getStart())+replacement+source.slice(form.end);
 output=output.replace('import { FieldVisual }','import { RecordComposer } from "@/components/record-composer";\nimport { FieldVisual }');
 fs.writeFileSync(path,output);console.log(file,fields.length,'fields',titles.length,'stages');
}
