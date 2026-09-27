import fs from 'node:fs';
import path from 'node:path';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) {const p=path.join(dir,e.name);if(e.isDirectory()) walk(p);else if(e.name.endsWith('.tsx')) files.push(p);} }
walk('dashboard/app'); walk('dashboard/components');
let count=0;
for(const file of files) {
 const source=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const edits=[];
 function visit(node) {
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='div') {
   const attr=node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='className');
   if(attr?.initializer&&ts.isStringLiteral(attr.initializer)&&attr.initializer.text.includes('workspace-heading')) {
    let parent=node.parent, candidate=null;
    for(let n=0;parent&&n<4;n++,parent=parent.parent) {
     if(!ts.isJsxElement(parent)) continue;
     const text=parent.getText(ast);
     if(text.length>8000||/<(table|section|form)\b/.test(text)) break;
     const a=parent.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='className');
     if(a?.initializer&&ts.isStringLiteral(a.initializer)&&a.initializer.text.includes('justify-between')&&!a.initializer.text.includes('workspace-heading')&&(text.match(/<h1\b/g)||[]).length===1) {candidate=a;break;}
    }
    if(candidate) {
     const clean=attr.initializer.text.replace(/\s*workspace-heading\s*/,' ').trim();
     edits.push({start:attr.initializer.getStart(ast),end:attr.initializer.end,value:JSON.stringify(clean)});
     edits.push({start:candidate.initializer.getStart(ast),end:candidate.initializer.end,value:JSON.stringify(candidate.initializer.text+' workspace-heading')});
     count++;
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 let next=source;for(const e of edits.sort((a,b)=>b.start-a.start)) next=next.slice(0,e.start)+e.value+next.slice(e.end);
 next=next.replaceAll(' className=""','');
 if(next!==source) fs.writeFileSync(file,next);
}
console.log(`Expanded ${count} heading panels to include their actions.`);
