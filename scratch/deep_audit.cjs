const fs = require('fs');
const path = require('path');

const targetFiles = [
  // Direct pages
  'dashboard/app/analytics/abandoned-objects/page.tsx',
  'dashboard/app/analytics/alerts/page.tsx',
  'dashboard/app/analytics/anpr/page.tsx',
  'dashboard/app/analytics/anpr-logistics/page.tsx',
  'dashboard/app/analytics/banking/authorized-persons/page.tsx',
  'dashboard/app/analytics/banking/page.tsx',
  'dashboard/app/analytics/behavioral/page.tsx',
  'dashboard/app/analytics/branch-comparison/page.tsx',
  'dashboard/app/analytics/camera-obstruction/page.tsx',
  'dashboard/app/analytics/camera-tamper/page.tsx',
  'dashboard/app/analytics/crowd/page.tsx',
  'dashboard/app/analytics/dashboard/page.tsx',
  'dashboard/app/analytics/face/page.tsx',
  'dashboard/app/analytics/face-recognition/page.tsx',
  'dashboard/app/analytics/fall/page.tsx',
  'dashboard/app/analytics/industrial/page.tsx',
  'dashboard/app/analytics/investigation/page.tsx',
  'dashboard/app/analytics/nbfc-watchlist/page.tsx',
  'dashboard/app/analytics/page.tsx',
  'dashboard/app/analytics/people/page.tsx',
  'dashboard/app/analytics/predictions/page.tsx',
  'dashboard/app/analytics/reid/page.tsx',
  'dashboard/app/analytics/retail/page.tsx',
  'dashboard/app/analytics/rules/page.tsx',
  'dashboard/app/analytics/tailgating/page.tsx',
  'dashboard/app/analytics/vehicles/page.tsx',

  // Associated components
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
  'dashboard/components/tailgating-detection-workspace.tsx'
];

const results = [];

targetFiles.forEach(file => {
  const fullPath = path.join('c:/Omsystems/Omsystems', file);
  if (!fs.existsSync(fullPath)) {
    results.push({ file, exists: false });
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  // check for suspicious keywords or hardcoded mock arrays
  lines.forEach((line, idx) => {
    // Check for mock, dummy, fake, sample, simulated, fallback data, hardcoded arrays
    if (/\b(mock|dummy|fake|sampleData|mockData|dummyData|SIMULATED|MOCK_|generateMock|initialData|SAMPLE_)\b/i.test(line)) {
      findings.push({ lineNum: idx + 1, type: 'keyword', text: line.trim() });
    }
    // Check for hardcoded fallback data assignment e.g. || [...] or ?? [...]
    if (/(\|\||\?\?)\s*(\[|\{[\s\w]+:)/.test(line) && !line.includes('?? []') && !line.includes('|| []') && !line.includes('?? {}') && !line.includes('|| {}')) {
      findings.push({ lineNum: idx + 1, type: 'fallback_literal', text: line.trim() });
    }
  });

  // check API calls vs local state
  const apiCalls = [];
  const fetchMatches = content.match(/fetch\([^\)]+\)/g) || [];
  const apiClientMatches = content.match(/\w+Api\.\w+/g) || [];

  results.push({
    file,
    exists: true,
    totalLines: lines.length,
    findings,
    fetchCount: fetchMatches.length,
    apiClientCalls: [...new Set(apiClientMatches)]
  });
});

fs.writeFileSync('c:/Omsystems/Omsystems/scratch/deep_audit.json', JSON.stringify(results, null, 2));
console.log('Deep audit complete.');
