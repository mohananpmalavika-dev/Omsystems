const fs = require('fs');

// Test the updated filterAuthorizedQuickActions
function pathOf(href) {
  return href.split(/[?#]/, 1)[0] || "/";
}

function filterAuthorizedQuickActions(actions, authorizedHrefs) {
  return actions.filter((action) => {
    if (authorizedHrefs.has(action.href)) return true;
    const actionPath = pathOf(action.href);
    if (authorizedHrefs.has(actionPath)) return true;
    return [...authorizedHrefs].some((href) => {
      const parentPath = pathOf(href);
      if (actionPath === parentPath || actionPath.startsWith(`${parentPath}/`)) return true;
      const actionPrefix = "/" + actionPath.split("/")[1];
      const parentPrefix = "/" + parentPath.split("/")[1];
      return actionPrefix === parentPrefix && (
        actionPrefix === "/maintenance" ||
        actionPrefix === "/admin" ||
        actionPrefix === "/compliance" ||
        actionPrefix === "/analytics"
      );
    });
  });
}

const quickActions = [
  { label: 'Security alert intelligence', href: '/analytics/alerts' },
  { label: 'Predictive operations', href: '/analytics/predictions' },
  { label: 'Investigation workspace', href: '/analytics/investigation' },
  { label: 'Device Configuration Center', href: '/maintenance/device-configuration' },
  { label: 'Feature Management', href: '/admin/features' },
  { label: 'Role vs Menu Permissions', href: '/admin/organization?tab=roles' },
  { label: 'Report an incident', href: '/incidents/create' },
  { label: 'Create work order', href: '/maintenance/workorders/new' },
  { label: 'Onboard a branch', href: '/admin/branch-onboarding' },
  { label: 'Register hardware asset', href: '/maintenance/assets/new' },
  { label: 'Add an AMC contract', href: '/maintenance/amc/new' },
  { label: 'Add a vendor / OEM', href: '/maintenance/vendors/new' },
  { label: 'Hardware Compatibility Lab', href: '/maintenance/compatibility' },
  { label: 'Smart Video Search', href: '/video-search' },
  { label: 'Multi-camera playback', href: '/playback/synced' },
  { label: 'Create a face watchlist', href: '/analytics/face-recognition?create=watchlist' },
  { label: 'Create an ANPR watchlist', href: '/analytics/anpr?create=watchlist' },
  { label: 'Add compliance requirement', href: '/compliance/requirements/new' },
  { label: 'Add compliance risk', href: '/compliance/risks/new' }
];

// Read navigation from app-layout.tsx
const appLayout = fs.readFileSync('dashboard/components/app-layout.tsx', 'utf8');
const hrefMatches = appLayout.matchAll(/href:\s*["'](\/[^"']+)["']/g);
const navHrefs = new Set();
for (const m of hrefMatches) {
  navHrefs.add(m[1]);
}

const filtered = filterAuthorizedQuickActions(quickActions, navHrefs);
console.log(`Quick actions passed: ${filtered.length} / ${quickActions.length}`);
const missing = quickActions.filter(qa => !filtered.some(f => f.href === qa.href));
if (missing.length > 0) {
  console.log('Missing quick actions:', missing);
} else {
  console.log('ALL 19 quick actions are now successfully authorized for admin!');
}
