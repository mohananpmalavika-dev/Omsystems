const fs = require('fs');
const path = require('path');

const components = [
  'dashboard/components/abandoned-object-workspace.tsx',
  'dashboard/components/incident-media-modal.tsx',
  'dashboard/components/anpr-workspace.tsx',
  'dashboard/components/banking/cctv-face-identification-panel.tsx',
  'dashboard/components/banking-analytics-dashboard.tsx',
  'dashboard/components/behavioral-analytics-workspace.tsx',
  'dashboard/components/camera-obstruction-workspace.tsx',
  'dashboard/components/camera-tamper-workspace.tsx',
  'dashboard/components/crowd-analytics-workspace.tsx',
  'dashboard/components/analytics-dashboard.tsx',
  'dashboard/components/analytics-domain-workspace.tsx',
  'dashboard/components/identity-watchlist-workspace.tsx',
  'dashboard/components/fall-detection-workspace.tsx',
  'dashboard/components/analytics-console.tsx',
  'dashboard/components/person-reid-workspace.tsx',
  'dashboard/components/nbfc-rules/nbfc-rules-workspace.tsx',
  'dashboard/components/tailgating-detection-workspace.tsx',
  'dashboard/components/alerts/alerts-graphical-analytics.tsx'
];

const results = [];

for (const comp of components) {
  const full = path.join('c:/Omsystems/Omsystems', comp);
  if (!fs.existsSync(full)) {
    results.push({ comp, error: 'Not found' });
    continue;
  }
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');
  const mockMatches = [];

  lines.forEach((line, idx) => {
    // Check for mock, dummy, fake, simulation, placeholder
    if (/\b(mock|dummy|fake|sampleData|mockData|dummyData|simulate|simulated|placeholder|hardcoded)\b/i.test(line)) {
      mockMatches.push({ lineNum: idx + 1, text: line.trim() });
    }
  });

  results.push({
    comp,
    totalLines: lines.length,
    matches: mockMatches
  });
}

fs.writeFileSync('c:/Omsystems/Omsystems/scratch/component_audit.json', JSON.stringify(results, null, 2));
console.log('Component audit complete.');
