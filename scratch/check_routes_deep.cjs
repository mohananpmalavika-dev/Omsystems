const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'dashboard', 'app');
const compDir = path.join(__dirname, '..', 'dashboard', 'components');

function getAllFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files = files.concat(getAllFiles(full));
      }
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = [...getAllFiles(appDir), ...getAllFiles(compDir)];

// Collect all route patterns
// 1. href="..." or href={`...`}
// 2. router.push(...)
// 3. window.location.href = ...

const staticLinks = new Map();
const dynamicPatterns = new Map();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Static href
  const matches = content.matchAll(/href=["'](\/[^"'#? ]+)(?:[?#][^"']*)?["']/g);
  for (const m of matches) {
    const r = m[1];
    if (!staticLinks.has(r)) staticLinks.set(r, []);
    staticLinks.get(r).push(file);
  }

  // Template literal href
  const tMatches = content.matchAll(/href={`(\/[^`$]+)[`$]/g);
  for (const m of tMatches) {
    const prefix = m[1];
    if (!dynamicPatterns.has(prefix)) dynamicPatterns.set(prefix, []);
    dynamicPatterns.get(prefix).push(file);
  }

  // router.push
  const rMatches = content.matchAll(/router\.push\(["'](\/[^"'#? ]+)(?:[?#][^"']*)?["']\)/g);
  for (const m of rMatches) {
    const r = m[1];
    if (!staticLinks.has(r)) staticLinks.set(r, []);
    staticLinks.get(r).push(file);
  }
}

function routeExists(r) {
  if (r === '/') return true;
  const parts = r.replace(/^\//, '').split('/').filter(Boolean);
  
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

console.log('=== STATIC LINKS CHECK ===');
for (const [r, callers] of staticLinks.entries()) {
  if (r.startsWith('/api') || r.startsWith('/_next') || r.endsWith('.png') || r.endsWith('.svg') || r.endsWith('.ico') || r.endsWith('.json')) continue;
  if (!routeExists(r)) {
    console.log('Broken static route:', r, 'in', callers.map(c => path.relative(path.join(__dirname, '..'), c)).join(', '));
  }
}

console.log('=== TEMPLATE PREFIX CHECK ===');
for (const [prefix, callers] of dynamicPatterns.entries()) {
  if (prefix.startsWith('/api')) continue;
  // Check if prefix directory exists
  const parts = prefix.replace(/^\//, '').split('/').filter(Boolean);
  let currentDir = appDir;
  let ok = true;
  for (const part of parts) {
    if (!fs.existsSync(currentDir)) { ok = false; break; }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const match = entries.find(e => e.isDirectory() && (e.name === part || (e.name.startsWith('[') && e.name.endsWith(']'))));
    if (match) {
      currentDir = path.join(currentDir, match.name);
    } else {
      ok = false;
      break;
    }
  }
  if (!ok) {
    console.log('Broken dynamic prefix:', prefix, 'in', callers.map(c => path.relative(path.join(__dirname, '..'), c)).join(', '));
  }
}
