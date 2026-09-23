const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        results = results.concat(walk(full));
      }
    } else if (file.endsWith('.tsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('dashboard');
const allVars = [];

files.forEach(filePath => {
  const code = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxExpression(node)) {
      if (node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        const exp = node.expression;
        if (exp) {
          const text = exp.getText(sf).trim();
          // Filter out complex JSX expressions, ternary, conditionals, functions, maps
          if (!text.includes('&&') && !text.includes('?') && !text.includes('(') && !text.includes('[') && !text.includes('+') && !text.includes('`') && !text.startsWith('"') && !text.startsWith("'") && !text.startsWith('<')) {
            const { line } = sf.getLineAndCharacterOfPosition(exp.getStart());
            allVars.push({ file: filePath, line: line + 1, text, code });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
});

console.log(`Total simple variable JSX children: ${allVars.length}`);

// Let's inspect variables that might be objects
// E.g. objects, metadata, details, params, config, state, payload, body, result, err, error
const potentialObjects = allVars.filter(v => {
  const t = v.text.toLowerCase();
  return t.includes('metadata') ||
         t.includes('config') ||
         t.includes('details') ||
         t.includes('params') ||
         t.includes('data') ||
         t.includes('payload') ||
         t.includes('body') ||
         t.includes('obj') ||
         t.includes('state') ||
         t.includes('item') ||
         t.includes('error') ||
         t.includes('err') ||
         t.includes('result') ||
         t.includes('info') ||
         t.includes('content') ||
         t.includes('message');
});

console.log(`Potential object candidates: ${potentialObjects.length}`);
potentialObjects.forEach(p => {
  console.log(`${p.file}:${p.line} -> {${p.text}}`);
});
