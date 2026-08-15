const fs = require('fs');
const p = 'C:\\Omsystems\\dashboard\\app\\api\\control\\[...path]\\route.ts';
let s = fs.readFileSync(p, 'utf8');
const oldSub = 'headers.set("authorization", `******;';
const newSub = 'headers.set("authorization", `Bearer ${employeeSession}`);';
if (s.includes(oldSub)) {
  s = s.replace(oldSub, newSub);
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched');
} else {
  console.log('old substring not found');
}
