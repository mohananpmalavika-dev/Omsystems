import fs from 'node:fs';
import path from 'node:path';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (entry.name.endsWith('.tsx')) files.push(p); } }
walk('dashboard/components');
const headings = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node) {
    if (!found && ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'h1' && !node.openingElement.getText(ast).includes('sr-only')) {
      found = true;
      let candidate = null;
      let parent = node.parent;
      for (let level = 0; parent && level < 5; level++, parent = parent.parent) {
        if (!ts.isJsxElement(parent)) continue;
        const tag = parent.openingElement.tagName.getText(ast);
        const text = parent.getText(ast);
        if (text.length > 6000 || /<(table|form|PageHero|ModulePage)\b/.test(text)) break;
        if (tag === 'header') { candidate = parent; break; }
        if (!candidate && tag === 'div' && (/<p\b/.test(text) || level >= 1) && text.length < 3500) candidate = parent;
      }
      if (candidate && !candidate.openingElement.getText(ast).includes('workspace-heading')) headings.push({ file, start: candidate.openingElement.getStart(ast), end: candidate.openingElement.end, tag: candidate.openingElement.getText(ast), title: node.getText(ast).slice(0, 130) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
fs.writeFileSync('tmp/heading-inventory.json', JSON.stringify(headings, null, 2));
console.log(JSON.stringify({ pages: files.length, candidates: headings.length, headings: headings.map(({ file, tag, title }) => ({ file, tag, title })) }, null, 2));
