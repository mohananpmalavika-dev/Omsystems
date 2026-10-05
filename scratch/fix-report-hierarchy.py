from pathlib import Path
import re

def edit(name, fn):
    p = Path(name)
    old = p.read_text(encoding='utf-8')
    new = fn(old)
    assert old != new, name
    p.write_text(new, encoding='utf-8', newline='\n')

def store(s):
    s = 'import { resolveReportHierarchy } from "../packages/contracts/src/report-hierarchy.js";\n' + s
    start = s.index('      const parentNode = branchNode?.parentId', s.index('  async listAnalyticsAlerts('))
    end = s.index('      const alertType = ', start)
    s = s[:start] + '''      const hierarchy = resolveReportHierarchy(branchId ?? '', this.nodes);
      const areaName = hierarchy.area || undefined;
      const regionName = hierarchy.region || undefined;
      const branchName = branchNode?.name || alert.branchName;
''' + s[end:]
    start = s.index('    return raw.map((alert) => {', s.index('  async listAnalyticsAlerts('))
    end = s.index('  async countAnalyticsAlerts(', start)
    block = s[start:end].replace('        ...(areaName ? { areaName } : {}),', '        branchId,\n        zoneName: hierarchy.zone || undefined,\n        areaName,').replace('        ...(regionName ? { regionName } : {}),', '        regionName,')
    return s[:start] + block + s[end:]

def repository(s):
    start = s.index('  async listAlerts(')
    end = s.index('  async transitionAlert(', start)
    block = s[start:end]
    block = re.sub(r"(?:event.metadata->>'zoneName'|zone.name) AS zone_name,\n         COALESCE\([\s\S]*?\) AS region_name,", '''hierarchy.zone_name, hierarchy.area_name, hierarchy.region_name,''', block)
    joins = '''       LEFT JOIN LATERAL (
         WITH RECURSIVE ancestors AS (
           SELECT n.id, n.parent_id, n.node_type, n.name, 0 AS depth, ARRAY[n.id] AS visited
           FROM resource_nodes n WHERE n.id = branch.id AND n.tenant_id = alert.tenant_id
           UNION ALL
           SELECT n.id, n.parent_id, n.node_type, n.name, a.depth + 1, a.visited || n.id
           FROM resource_nodes n JOIN ancestors a ON n.id = a.parent_id
           WHERE n.tenant_id = alert.tenant_id AND NOT n.id = ANY(a.visited)
         )
         SELECT
           (SELECT name FROM ancestors WHERE node_type::text = 'zone' ORDER BY depth LIMIT 1) AS zone_name,
           (SELECT name FROM ancestors WHERE node_type::text = 'area' ORDER BY depth LIMIT 1) AS area_name,
           (SELECT name FROM ancestors WHERE node_type::text = 'region' ORDER BY depth LIMIT 1) AS region_name
       ) hierarchy ON true'''
    block = re.sub(r'       LEFT JOIN resource_nodes parent_node[^\n]*\n       LEFT JOIN resource_nodes grandparent_node[^\n]*', joins, block)
    block = re.sub(r'       LEFT JOIN LATERAL \(\n         SELECT name FROM nbfc_analytics_zones[\s\S]*?\) zone ON true\n', '', block)
    return s[:start] + block + s[end:]

def mis(s):
    s = 'import { resolveReportHierarchy, reportDayBounds, reportLocalDate, validReportDay } from "../../../packages/contracts/src/report-hierarchy.js";\n' + s
    start = s.index('function getDateRange(')
    end = s.index('\nfunction metricNumber', start)
    s = s[:start] + '''function getDateRange(query: MISReportQuery): { startDate: Date; endDate: Date } {
  const today = reportLocalDate(new Date());
  const days = query.timeRange === '7d' ? 7 : query.timeRange === '30d' ? 30 : query.timeRange === '90d' ? 90 : 1;
  const startDay = query.timeRange === 'custom' ? query.startDate! :
    new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const bounds = reportDayBounds(startDay, query.timeRange === 'custom' ? query.endDate! : today);
  return { startDate: new Date(bounds.from), endDate: new Date(bounds.to) };
}
''' + s[end:]
    s = s.replace('!Number.isFinite(Date.parse(query.startDate)) || !Number.isFinite(Date.parse(query.endDate))', '!validReportDay(query.startDate) || !validReportDay(query.endDate)')
    start = s.index("    let area_name = 'General Area';")
    end = s.index('\n    branches.push({', start)
    s = s[:start] + '''    const resolved = resolveReportHierarchy(node.id, new Map(rawNodes.map(n => [n.id, {
      id: n.id, parentId: n.parent_id, type: n.node_type, name: n.name,
    }])));
    const { area: area_name, region: region_name, zone: zone_name, organization: org_name } = resolved;
''' + s[end:]
    s = s.replace("b.org_name || 'Enterprise Operations'", "b.org_name || b.branch_name")
    s = s.replace("b.zone_name || 'General Zone'", "b.zone_name || b.branch_name")
    s = s.replace("b.region_name || 'General Region'", "b.region_name || b.branch_name")
    s = s.replace("b.area_name || 'General Area'", "b.area_name || b.branch_name")
    s = s.replace("branch.zone_name === 'General Zone' ? null : branch.zone_name", "branch.zone_name || null")
    # Preserve separate branches when their display names coincide.
    s = s.replace("    let key = b.branch_name;", "    let key = b.branch_id;")
    s = s.replace('      dimension: dimensionKey,', "      dimension: groupBy === 'branch' ? groupBranches[0]!.branch_name : dimensionKey,\n      branchId: groupBy === 'branch' ? groupBranches[0]!.branch_id : undefined,")
    # Cascading choices must retain branches attached directly at any level.
    s = s.replace('  const filterOptions = buildFilterOptions(allBranchesInEstate);', '''  const filterOptions = {
    organizations: buildFilterOptions(allBranchesInEstate).organizations,
    zones: buildFilterOptions(allBranchesInEstate.filter(b => !query.organization || b.org_name === query.organization)).zones,
    regions: buildFilterOptions(allBranchesInEstate.filter(b => (!query.organization || b.org_name === query.organization) && (!query.zone || b.zone_name === query.zone))).regions,
    areas: buildFilterOptions(allBranchesInEstate.filter(b => (!query.organization || b.org_name === query.organization) && (!query.zone || b.zone_name === query.zone) && (!query.region || b.region_name === query.region))).areas,
    branches: buildFilterOptions(filteredBranches.filter(b => !query.branchId || b.branch_id === query.branchId)).branches,
  };''')
    s = s.replace('    allBranches,\n    dateWiseBreakdown,', '    allBranches,\n    branchMatrix,\n    dateWiseBreakdown,')
    s = s.replace('      generatedAt: new Date().toISOString(),', "      timezone: 'Asia/Kolkata',\n      healthBasis: 'Current camera and retention snapshot; incident and activity metrics use the selected period',\n      generatedAt: new Date().toISOString(),")
    s = s.replace('DATE(created_at)', "DATE(created_at AT TIME ZONE 'Asia/Kolkata')").replace('EXTRACT(HOUR FROM created_at)', "EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')")
    return s

edit('src/store.ts', store)
edit('src/database/analytics-repository.ts', repository)
edit('src/routes/reports/mis-unified.routes.ts', mis)
