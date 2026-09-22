const fs = require('fs');

const content = fs.readFileSync('dashboard/lib/role-workspaces.ts', 'utf8');
const match = content.match(/export const roleWorkspacePaths: Record<string, string\[\]> = (\{[\s\S]*?\n\};)/);
const roleWorkspacePaths = eval('(' + match[1].replace(/;$/, '') + ')');

// Extract current navigation from app-layout.tsx
const appLayout = fs.readFileSync('dashboard/components/app-layout.tsx', 'utf8');
const navMatch = appLayout.match(/export const navigation: NavGroup\[\] = \[([\s\S]*?)\n\];/);
const navItems = [];
const itemMatches = navMatch[1].matchAll(/href:\s*["'](\/[^"']+)["']/g);
for (const m of itemMatches) {
  navItems.push(m[1]);
}

console.log(`Total current navigation items: ${navItems.length}`);

for (const [role, allowed] of Object.entries(roleWorkspacePaths)) {
  const allowedSet = new Set(allowed);
  const visible = navItems.filter(item => allowedSet.has(item));
  const missingFromNav = allowed.filter(item => !navItems.includes(item.split('?')[0]));
  console.log(`Role: ${role.padEnd(20)} | Visible in sidebar: ${visible.length}/${navItems.length}`);
  if (missingFromNav.length > 0) {
    console.log(`  Sub/Specialist routes: ${missingFromNav.join(', ')}`);
  }
}
