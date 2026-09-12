import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const dashboardDir = path.join(rootDir, 'dashboard');
const appDir = path.join(dashboardDir, 'app');
const componentsDir = path.join(dashboardDir, 'components');
const apiDir = path.join(appDir, 'api');
const backendRoutesDir = path.join(rootDir, 'src', 'routes');
const backendAppFile = path.join(rootDir, 'src', 'app.ts');

function walkDir(dir, fileList = [], filter = null) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList, filter);
    } else {
      if (!filter || filter(filePath)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

// 1. Gather all Next.js App routes
const pageFiles = walkDir(appDir, [], (f) => f.endsWith('page.tsx') || f.endsWith('page.jsx'));
const appRoutes = pageFiles.map(f => {
  let rel = path.relative(appDir, f).replace(/\\/g, '/');
  rel = rel.replace(/\/page\.(tsx|jsx)$/, '');
  if (rel === 'page.tsx' || rel === 'page.jsx') rel = '';
  return {
    route: '/' + rel,
    filePath: f,
    isDynamic: rel.includes('[')
  };
});

// Also include pages router if any
const pagesDir = path.join(dashboardDir, 'pages');
const pagesFiles = walkDir(pagesDir, [], (f) => (f.endsWith('.tsx') || f.endsWith('.jsx')) && !f.includes('_app'));
const allRoutes = [...appRoutes];
for (const f of pagesFiles) {
  let rel = path.relative(pagesDir, f).replace(/\\/g, '/').replace(/\.(tsx|jsx)$/, '');
  allRoutes.push({
    route: '/' + rel,
    filePath: f,
    isDynamic: rel.includes('[')
  });
}

// Map of route template matching
function templateToRegex(routePattern) {
  // Convert /compliance/assessments/[id] to ^/compliance/assessments/[^/]+$
  const regexStr = '^' + routePattern
    .replace(/\[\.\.\.[^\]]+\]/g, '.*')
    .replace(/\[[^\]]+\]/g, '[^/]+') + '$';
  return new RegExp(regexStr);
}

// Build route matchers
const routeMatchers = allRoutes.map(r => ({
  route: r.route,
  regex: templateToRegex(r.route)
}));

function isValidTarget(target) {
  const clean = target.split('?')[0].split('#')[0];
  if (!clean || clean === '/' || clean === '') return true;
  return routeMatchers.some(m => m.regex.test(clean));
}

// Scan all components and app pages
const allCodeFiles = [
  ...walkDir(appDir, [], (f) => f.endsWith('.tsx') || f.endsWith('.ts')),
  ...walkDir(componentsDir, [], (f) => f.endsWith('.tsx') || f.endsWith('.ts'))
];

console.log(`Analyzing ${allCodeFiles.length} files (pages + components)...`);

// Gather all links (static and template literals)
const linkIssues = [];
const dummyActions = [];
const todoList = [];
const mockDataUsage = [];
const apiCalls = new Map(); // endpoint -> { callers: Set, isTemplate: boolean }

for (const file of allCodeFiles) {
  const relPath = path.relative(dashboardDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  // Check for router.push and href
  // 1. Literal href="xyz" or push("xyz")
  const literalMatches = [
    ...content.matchAll(/href=["'](\/[^"']*)["']/g),
    ...content.matchAll(/router\.push\(["'](\/[^"']*)["']\)/g)
  ];
  for (const m of literalMatches) {
    const target = m[1];
    if (target.startsWith('/api') || target.startsWith('//')) continue;
    if (!isValidTarget(target)) {
      linkIssues.push({
        file: relPath,
        type: 'literal_broken_link',
        target
      });
    }
  }

  // 2. Template literals href={`/xyz/${id}`} or router.push(`/xyz/${id}`)
  const templateMatches = [
    ...content.matchAll(/href=\{`(\/[^`]*)`\}/g),
    ...content.matchAll(/router\.push\(`(\/[^`]*)`\)/g)
  ];
  for (const m of templateMatches) {
    const rawTemplate = m[1];
    if (rawTemplate.startsWith('/api') || rawTemplate.startsWith('//')) continue;
    // Normalize ${...} to a dummy parameter like "dummy_id" or empty string (if query context)
    const simulatedParam = rawTemplate.replace(/\$\{[^}]+\}/g, 'dummy_id');
    const simulatedEmpty = rawTemplate.replace(/\$\{[^}]+\}/g, '');
    const simulatedQuery = rawTemplate.replace(/\$\{[^}]+\}/g, '?param=123');
    if (!isValidTarget(simulatedParam) && !isValidTarget(simulatedEmpty) && !isValidTarget(simulatedQuery)) {
      linkIssues.push({
        file: relPath,
        type: 'dynamic_broken_link',
        target: rawTemplate,
        simulated: simulatedParam
      });
    }
  }

  // Check for TODOs / FIXMEs
  lines.forEach((line, idx) => {
    if (/\b(TODO|FIXME|NOT IMPLEMENTED|PLACEHOLDER)\b/i.test(line)) {
      // Ignore if in test or comment about external standard
      if (!file.includes('.test.') && !file.includes('e2e')) {
        todoList.push({
          file: relPath,
          line: idx + 1,
          text: line.trim()
        });
      }
    }
  });

  // Check for dummy alert / console.log actions
  lines.forEach((line, idx) => {
    if (/onClick=\{[^}]*\balert\(/i.test(line) || /onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(line) || /toast\.(?:info|error)\(["']Feature coming soon/i.test(line) || /alert\(["'].*coming soon/i.test(line)) {
      dummyActions.push({
        file: relPath,
        line: idx + 1,
        text: line.trim()
      });
    }
  });

  // Check for mock data definitions
  lines.forEach((line, idx) => {
    if (/(?:const|let)\s+(?:mock[A-Z]|MOCK_|sample[A-Z]|SAMPLE_|dummy[A-Z]|DUMMY_)[a-zA-Z0-9_]*\s*=/i.test(line)) {
      mockDataUsage.push({
        file: relPath,
        line: idx + 1,
        text: line.trim()
      });
    }
  });

  // Check API calls
  const apiMatches = [
    ...content.matchAll(/fetch\s*\(\s*["']([^"']+)["']/g),
    ...content.matchAll(/fetch\s*\(\s*`([^`]+)`/g),
    ...content.matchAll(/(?:authApi|apiClient)\.(?:get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g),
    ...content.matchAll(/(?:authApi|apiClient)\.(?:get|post|put|patch|delete)\s*\(\s*`([^`]+)`/g)
  ];
  for (const m of apiMatches) {
    const raw = m[1];
    if (!apiCalls.has(raw)) apiCalls.set(raw, { callers: new Set(), isTemplate: raw.includes('${') });
    apiCalls.get(raw).callers.add(relPath);
  }
}

// 3. Fastify Backend Endpoints
let backendAppContent = '';
if (fs.existsSync(backendAppFile)) backendAppContent = fs.readFileSync(backendAppFile, 'utf-8');
const backendRouteFiles = walkDir(backendRoutesDir, [], (f) => f.endsWith('.ts') || f.endsWith('.js'));
const backendEndpoints = new Set();
const backendRegex = /(?:app|fastify|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
let m;
while ((m = backendRegex.exec(backendAppContent)) !== null) backendEndpoints.add(m[2]);
for (const bf of backendRouteFiles) {
  const content = fs.readFileSync(bf, 'utf-8');
  while ((m = backendRegex.exec(content)) !== null) backendEndpoints.add(m[2]);
}

// Next.js API route handlers
const nextApiFiles = walkDir(apiDir, [], (f) => f.endsWith('route.ts') || f.endsWith('route.js'));
const nextApiMatchers = nextApiFiles.map(f => {
  let rel = path.relative(apiDir, f).replace(/\\/g, '/').replace(/\/route\.(ts|js)$/, '');
  const isCatchAll = rel.includes('[...');
  const base = isCatchAll ? '/api/' + rel.split('/[...')[0] : '';
  return {
    apiRoute: '/api/' + rel,
    isCatchAll,
    base,
    regex: templateToRegex('/api/' + rel)
  };
});

// Check API calls against Next API & Backend
const unresolvedApis = [];
for (const [endpoint, info] of apiCalls.entries()) {
  const clean = endpoint.split('?')[0];
  // Check Next API match
  let matchesNext = nextApiMatchers.some(na => {
    if (na.isCatchAll && clean.startsWith(na.base)) return true;
    return na.regex.test(clean);
  });

  // Check backend match (accounting for /api/control/v1 proxy or /api/v1 proxy)
  let backendPath = clean;
  if (backendPath.startsWith('/api/control/')) backendPath = backendPath.replace('/api/control/', '/');
  if (backendPath.startsWith('/api/v1/')) backendPath = backendPath.replace('/api/v1/', '/v1/');

  // Replace ${...} or :param with regex
  let simulatedBackend = backendPath.replace(/\$\{[^}]+\}/g, 'dummy');
  let matchesBackend = [...backendEndpoints].some(be => {
    // Fastify params are :param
    const beRegex = new RegExp('^' + be.replace(/:[a-zA-Z0-9_-]+/g, '[^/]+') + '$');
    return beRegex.test(simulatedBackend) || beRegex.test(backendPath);
  });

  if (!matchesNext && !matchesBackend && !clean.startsWith('http')) {
    unresolvedApis.push({
      endpoint,
      clean,
      simulatedBackend,
      callers: Array.from(info.callers)
    });
  }
}

const detailedReport = {
  brokenLinks: linkIssues,
  todoCount: todoList.length,
  todos: todoList,
  dummyActionsCount: dummyActions.length,
  dummyActions,
  mockDataCount: mockDataUsage.length,
  mockData: mockDataUsage,
  unresolvedApisCount: unresolvedApis.length,
  unresolvedApis
};

fs.writeFileSync(path.join(rootDir, 'scratch', 'deep_audit_report.json'), JSON.stringify(detailedReport, null, 2));

console.log("\n=== DEEP AUDIT RESULTS ===");
console.log(`Broken Links Found: ${linkIssues.length}`);
linkIssues.forEach(l => console.log(`  - [${l.file}] -> ${l.target}`));

console.log(`\nDummy/Inert Buttons or Stubs Found: ${dummyActions.length}`);
dummyActions.slice(0, 15).forEach(d => console.log(`  - [${d.file}:${d.line}] ${d.text}`));

console.log(`\nUnresolved API Calls: ${unresolvedApis.length}`);
unresolvedApis.slice(0, 15).forEach(u => console.log(`  - ${u.endpoint} in ${u.callers.join(', ')}`));

console.log(`\nMock Data Declarations: ${mockDataUsage.length}`);
mockDataUsage.slice(0, 15).forEach(m => console.log(`  - [${m.file}:${m.line}] ${m.text}`));
