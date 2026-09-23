const fs = require('fs');
const content = fs.readFileSync('dashboard/.next/server/app/page_client-reference-manifest.js', 'utf8');
const obj = JSON.parse(content.replace(/^.*?=\s*/, ''));
console.log('ClientModules:');
const clientModules = obj.clientModules || {};
for (const [k, v] of Object.entries(clientModules)) {
  console.log(k, '->', v.name, v.id);
}
