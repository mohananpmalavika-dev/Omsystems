const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'dashboard', 'app');
const compDir = path.join(__dirname, '..', 'dashboard', 'components');

function getAllFiles(dir, exts = ['.tsx', '.ts', '.jsx', '.js']) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files = files.concat(getAllFiles(full, exts));
      }
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const files = [...getAllFiles(appDir), ...getAllFiles(compDir)];
const linkRegex = /href=["'](\/[^"'#? ]+)(?:[?#][^"']*)?["']/g;
const routerRegex = /router\.push\(["'](\/[^"'#? ]+)(?:[?#][^"']*)?["']\)/g;

const allLinks = new Map(); // link -> array of files
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = linkRegex.exec(content)) !== null) {
    const l = m[1];
    if (!allLinks.has(l)) allLinks.set(l, []);
    allLinks.get(l).push(f);
  }
  while ((m = routerRegex.exec(content)) !== null) {
    const l = m[1];
    if (!allLinks.has(l)) allLinks.set(l, []);
    allLinks.get(l).push(f);
  }
}

function routeExists(r) {
  if (r === '/') return true;
  const parts = r.replace(/^\//, '').split('/');
  
  function searchDir(currentDir, partIndex) {
    if (partIndex >= parts.length) {
      return fs.existsSync(path.join(currentDir, 'page.tsx')) ||
             fs.existsSync(path.join(currentDir, 'page.jsx')) ||
             fs.existsSync(path.join(currentDir, 'page.js'));
    }
    const currentPart = parts[partIndex];
    if (!fs.existsSync(currentDir)) return false;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === currentPart) {
          if (searchDir(path.join(currentDir, entry.name), partIndex + 1)) return true;
        } else if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
          if (searchDir(path.join(currentDir, entry.name), partIndex + 1)) return true;
        }
      }
    }
    return false;
  }
  return searchDir(appDir, 0);
}

const missingLinks = [];
for (const [link, callers] of allLinks.entries()) {
  if (link.startsWith('/api') || link.startsWith('/_next') || link.startsWith('/favicon') || link.startsWith('/icons') || link.startsWith('/images') || link.startsWith('/static')) continue;
  if (!routeExists(link)) {
    missingLinks.push({ link, callerCount: callers.length, sampleCaller: callers[0] });
  }
}

console.log('Total unique links found:', allLinks.size);
console.log('Missing/broken links count:', missingLinks.length);
console.log('Missing links detail:');
missingLinks.forEach(m => {
  console.log(`- ${m.link} (referenced in ${path.basename(m.sampleCaller)})`);
});
