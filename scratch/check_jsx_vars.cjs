const ts = require('typescript');
const fs = require('fs');

const code = fs.readFileSync('dashboard/components/login-form.tsx', 'utf8');
const sf = ts.createSourceFile('login-form.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function visit(node) {
  if (ts.isJsxExpression(node)) {
    if (node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const exp = node.expression;
      if (exp) {
        const text = exp.getText(sf).trim();
        if (!text.includes('&&') && !text.includes('?') && !text.startsWith('"') && !text.startsWith("'")) {
          const { line } = sf.getLineAndCharacterOfPosition(exp.getStart());
          console.log(`${line + 1}: ${text}`);
        }
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sf);
