import { runSSM } from './run-ssm.mjs';

const script = `
docker exec sentinel-aws-dashboard node -e "
const fs = require('fs');
const path = require('path');
function find(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) find(full);
    else if (f.endsWith('.js')) {
      const c = fs.readFileSync(full, 'utf8');
      if (c.includes('Please use') && c.includes('only')) {
        console.log('FOUND EXACT MATCH IN:', full);
        const l = c.split('\\n');
        l.forEach((line, i) => {
          if (line.includes('Please use')) console.log(l.slice(Math.max(0, i-5), i+10).join('\\n'));
        });
      }
    }
  }
}
find('/app/node_modules/next/dist');
"
`;

runSSM(script);
