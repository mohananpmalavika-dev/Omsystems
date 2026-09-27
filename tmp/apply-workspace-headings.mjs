import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const inventory = JSON.parse(fs.readFileSync('tmp/heading-inventory.json', 'utf8'));
let changed = 0;
for (const entry of inventory) {
  if (/control-room|live-incident|portable-camera|communications\\connect|page-hero|module-page|signal-canvas|command-center-view|login|application-shell/.test(entry.file)) continue;
  const source = fs.readFileSync(entry.file, 'utf8');
  const ast = ts.createSourceFile(entry.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let opening;
  function visit(node) { if (ts.isJsxOpeningElement(node) && node.getStart(ast) === entry.start) opening = node; ts.forEachChild(node, visit); }
  visit(ast);
  if (!opening) throw new Error(`Heading not found: ${entry.file}`);
  const attribute = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'className');
  let start, end, replacement;
  if (attribute?.initializer && ts.isStringLiteral(attribute.initializer)) {
    start = attribute.initializer.getStart(ast); end = attribute.initializer.end;
    replacement = JSON.stringify(`${attribute.initializer.text} workspace-heading`);
  } else if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) {
    start = attribute.initializer.getStart(ast); end = attribute.initializer.end;
    replacement = `{(${attribute.initializer.expression.getText(ast)}) + " workspace-heading"}`;
  } else {
    start = opening.end - 1; end = start; replacement = ' className="workspace-heading"';
  }
  fs.writeFileSync(entry.file, source.slice(0, start) + replacement + source.slice(end));
  changed++;
}
console.log(`Applied shared headings to ${changed} route files.`);
