const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') results.push(...walk(full));
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = walk('dashboard');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = [...content.matchAll(/set\w*Error\(([^)]+)\)/g)];
  for (const m of matches) {
    const arg = m[1].trim();
    if (arg !== 'null' && arg !== '""' && arg !== "''" && !arg.startsWith('"') && !arg.startsWith("'")) {
      console.log(`${file} -> ${m[0]}`);
    }
  }
}
