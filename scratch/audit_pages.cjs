const fs = require('fs');
const path = require('path');

const analyticsDir = 'c:/Omsystems/Omsystems/dashboard/app/analytics';

function getPages(d) {
  let results = [];
  const list = fs.readdirSync(d);
  for (const item of list) {
    const full = path.join(d, item);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(getPages(full));
    } else if (item === 'page.tsx') {
      results.push(full);
    }
  }
  return results;
}

const pages = getPages(analyticsDir);

const analysis = pages.map(pagePath => {
  const rel = path.relative(analyticsDir, pagePath).replace(/\\/g, '/');
  const code = fs.readFileSync(pagePath, 'utf8');
  
  // Find imports
  const lines = code.split('\n');
  const imports = lines
    .filter(l => l.trim().startsWith('import'))
    .map(l => l.trim());

  // Search for mock patterns
  const mockMatches = [];
  lines.forEach((line, idx) => {
    if (/mock|dummy|fake|simulate|placeholder|sample/i.test(line)) {
      mockMatches.push({ line: idx + 1, content: line.trim() });
    }
  });

  return {
    page: rel,
    totalLines: lines.length,
    imports,
    mockMatches,
    codeLength: code.length
  };
});

fs.writeFileSync('c:/Omsystems/Omsystems/scratch/analytics_audit.json', JSON.stringify(analysis, null, 2));
console.log('Done auditing ' + analysis.length + ' pages.');
