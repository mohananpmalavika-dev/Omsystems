from pathlib import Path
def edit(name, fn):
    p=Path(name); old=p.read_text(encoding='utf-8'); new=fn(old); assert old!=new,name; p.write_text(new,encoding='utf-8',newline='\n')

edit('src/control-plane-store.ts', lambda s:s.replace('export interface AnalyticsAlertFilters {', 'export interface AnalyticsAlertFilters {\n  offset?: number | undefined;'))
edit('src/routes/analytics.routes.ts', lambda s:s.replace('const alertListQuery = z.object({', 'const alertListQuery = z.object({\n  offset: z.coerce.number().int().min(0).default(0),').replace('return { data: candidates, summary, total: summary.total };','return { data: candidates, summary, total: summary.total, hasMore: candidates.length === query.limit };'))
edit('src/store.ts', lambda s:s.replace('      .slice(0, filters.limit);\n\n    return raw.map', '      .slice(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit);\n\n    return raw.map'))
edit('src/database/analytics-repository.ts', lambda s:s.replace('alert.last_detected_at DESC LIMIT $8`,','alert.last_detected_at DESC, alert.id DESC LIMIT $8 OFFSET $10`,').replace('filters.to ?? null, filters.limit, filters.cameraIds ?? null],','filters.to ?? null, filters.limit, filters.cameraIds ?? null, filters.offset ?? 0],'))

edit('src/reporting/types.ts', lambda s:s.replace('export interface OperationalReportFilters {','export interface OperationalReportFilters {\n  zone?: string;\n  area?: string;'))
edit('src/routes/operational-reports.routes.ts', lambda s:s.replace('const filters=z.object({region:', 'const filters=z.object({zone:z.string().trim().min(1).max(120).optional(),area:z.string().trim().min(1).max(120).optional(),region:').replace('}).default({});\nconst scheduleBody', '}).refine(value => !value.from || !value.to || value.from <= value.to, {message:"End date must follow start date"}).default({});\nconst scheduleBody'))

def worker(s):
    s='import { resolveReportHierarchy } from "../../packages/contracts/src/report-hierarchy.js";\n'+s
    s=s.replace('for (const id of branch.path) {','for (const id of [branch.id, ...branch.path]) {')
    start=s.index('  const regionByBranch = ');end=s.index('  const telemetry=',start)
    s=s[:start]+'''  const hierarchyByBranch = new Map(branches.map(branch => [branch.id, resolveReportHierarchy(branch.id, nodesById)]));
  const regionByBranch = new Map([...hierarchyByBranch].map(([id, h]) => [id, h.region]));
  branches = branches.filter(branch => {
    const h = hierarchyByBranch.get(branch.id)!;
    return (!filters.zone || h.zone === filters.zone) && (!filters.region || h.region === filters.region) && (!filters.area || h.area === filters.area);
  });
  const hierarchyColumns = (id: string) => {
    const h = hierarchyByBranch.get(id);
    return { zone: h?.zone ?? '', region: h?.region ?? '', area: h?.area ?? '', organizationPath: h?.path.join(' / ') ?? '' };
  };
'''+s[end:]
    s=s.replace('region:branch.region,','...hierarchyColumns(branch.id),')
    s=s.replace('region:row.region,','zone:row.zone,region:row.region,area:row.area,')
    s=s.replace('alertId:alert.id,branchId:', 'alertId:alert.id,...hierarchyColumns(cameraBranch.get(alert.cameraId) ?? ""),branchId:')
    s=s.replace('  let alerts=await store.listAnalyticsAlerts(user.tenantId,{limit:10_000,from,to});', '''  const scopeCameras = selected.flatMap(branch => branch.cameras.map(camera => camera.id));
  const alertsInScope = [];
  if (scopeCameras.length) {
    for (let offset = 0; ; offset += 200) {
      const batch = await store.listAnalyticsAlerts(user.tenantId, { cameraIds: scopeCameras, limit: 200, offset, from, to });
      alertsInScope.push(...batch);
      if (batch.length < 200) break;
    }
  }
  let alerts = alertsInScope;''')
    return s
edit('src/reporting/worker.ts', worker)

def collector(s):
    s='import { resolveReportHierarchy } from "../../../packages/contracts/src/report-hierarchy.js";\n'+s
    start=s.index('      if (options.filters?.region) {');end=s.index('      const selectedBranchIds',start)
    s=s[:start]+'''      const organizationNodes = await activeStore.listOrganizationNodes(options.tenantId, undefined, undefined, true);
      const hierarchyNodes = new Map(organizationNodes.map(node => [node.id, node]));
      const hierarchyByBranch = new Map(branchNodes.map(node => [node.id, resolveReportHierarchy(node.id, hierarchyNodes)]));
      if (options.filters?.region) {
        branchNodes = branchNodes.filter(node => hierarchyByBranch.get(node.id)?.region === options.filters?.region);
      }
'''+s[end:]
    s=s.replace('region: snapshot.regionName || node.metadata?.region || "Unassigned",','region: hierarchyByBranch.get(node.id)?.region || "",\n            zone: hierarchyByBranch.get(node.id)?.zone || "",\n            area: hierarchyByBranch.get(node.id)?.area || "",')
    return s
edit('src/reporting/services/daily-surveillance-collector.service.ts',collector)
edit('src/reporting/domain/daily-surveillance-report.types.ts',lambda s:s.replace('export interface BranchHealthReportRow {','export interface BranchHealthReportRow {\n  zone?: string;\n  area?: string;'))
edit('src/reporting/renderers/daily-surveillance-xlsx.renderer.ts',lambda s:s.replace('region: b.region || "Unassigned",','zone: b.zone || "",\n      region: b.region || "",\n      area: b.area || "",'))
