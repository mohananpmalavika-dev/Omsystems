import fs from 'node:fs';
import path from 'node:path';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tsx')) files.push(p); } }
walk('dashboard/app'); walk('dashboard/components');
let count = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/workspace-heading|admin-header|record-form-hero|recording-header/.test(source)) continue;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxElement(node)) {
      const attribute = node.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'className');
      if (/workspace-heading|admin-header|record-form-hero|recording-header/.test(attribute?.initializer?.getText(ast) || '') && !node.children.some(child => child.getText(ast).includes('<FieldVisual'))) edits.push(node.closingElement.getStart(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!edits.length) continue;
  let next = source;
  for (const pos of edits.sort((a, b) => b - a)) next = next.slice(0, pos) + '<FieldVisual />' + next.slice(pos);
  const importPos = ast.statements.find(s => ts.isImportDeclaration(s))?.getStart(ast);
  if (importPos == null) throw new Error(`No import anchor: ${file}`);
  if (!source.includes('import { FieldVisual }')) next = next.slice(0, importPos) + 'import { FieldVisual } from "@/components/field-visual";\n' + next.slice(importPos);
  fs.writeFileSync(file, next); count += edits.length;
}
console.log(`Added field artwork to ${count} marked workspace headings.`);
