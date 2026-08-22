const fs = require('fs');
const p = 'C:\\Omsystems\\dashboard\\app\\api\\control\\[...path]\\route.ts';
let s = fs.readFileSync(p, 'utf8');
const re = /headers\.set\(\"authorization\",[\s\S]*?;/;
const newSub = 'headers.set("authorization", `Bearer ${employeeSession}`);';
if (re.test(s)){
  s = s.replace(re, newSub);
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched regex');
} else {
  console.log('regex did not match');
}
