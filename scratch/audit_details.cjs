const fs = require('fs');
const path = require('path');

const analyticsDir = 'c:/Omsystems/Omsystems/dashboard/app/analytics';

function getFiles(d) {
  let results = [];
  const list = fs.readdirSync(d);
  for (const item of list) {
    const full = path.join(d, item);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = getFiles(analyticsDir);

const analysis = files.map(file => {
  const rel = path.relative(analyticsDir, file).replace(/\\/g, '/');
  const code = fs.readFileSync(file, 'utf8');
  
  // check useState with initial non-empty arrays/objects
  const useStateNonEmpty = [];
  const regexUseState = /useState<[^>]*>\(\s*(\[[^\]]+\]|\{[^\}]+\})\s*\)/g;
  let match;
  while ((match = regexUseState.exec(code)) !== null) {
    if (match[1].length > 10) {
      useStateNonEmpty.push(match[0].slice(0, 150));
    }
  }

  // check for const ... = [ ... ] that has objects inside
  const hardcodedArrays = [];
  const regexArray = /const\s+([A-Za-z0-9_]+)\s*(:\s*[^=]+)?\s*=\s*\[\s*\{/g;
  while ((match = regexArray.exec(code)) !== null) {
    hardcodedArrays.push(match[1]);
  }

  // check catch blocks
  const catchBlocks = [];
  const regexCatch = /catch\s*\([^)]*\)\s*\{([^}]+)\}/g;
  while ((match = regexCatch.exec(code)) !== null) {
    const body = match[1];
    if (/set[A-Z]\w+\(\s*(\[|\{)/.test(body) && !body.includes('([])') && !body.includes('({})') && !body.includes('(null)')) {
      catchBlocks.push(body.trim());
    }
  }

  return {
    file: rel,
    hardcodedArrays,
    useStateNonEmpty,
    catchBlocksWithFallbacks: catchBlocks
  };
});

fs.writeFileSync('c:/Omsystems/Omsystems/scratch/data_audit_details.json', JSON.stringify(analysis, null, 2));
console.log('Detailed data audit complete.');
