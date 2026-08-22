const fs = require('fs');
const p = 'C:\\Omsystems\\dashboard\\app\\api\\control\\[...path]\\route.ts';
let s = fs.readFileSync(p, 'utf8');
const re = /}\s*else if \(employeeSession\) \{[\s\S]*?}\s*else\s*\{/;
const replacement = '} else if (employeeSession) {\n    headers.set("authorization", `Bearer ${employeeSession}`);\n  } else {';
if (re.test(s)){
  s = s.replace(re, replacement);
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched block');
} else {
  console.log('block not matched');
}
